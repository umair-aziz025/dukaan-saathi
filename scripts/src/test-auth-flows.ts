import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getFirebaseAdminApp, getFirebaseAdminAuth } from "@workspace/db";

const firebaseProjectId = "dukaan-saathi-18899";
const credentialsFilePath = fileURLToPath(
  new URL("../../generated-artifacts/demo-account-passwords.json", import.meta.url),
);
// Optional real mailbox, explicitly provided by the operator. Never send to example.com placeholders.
const emailDeliveryTestAccount = process.env.DEMO_EMAIL_CANARY_ACCOUNT?.trim().toLowerCase();
let currentStep = "starting";
let failureStep: string | null = null;

type DemoCredential = {
  email: string;
  password: string;
};

type CredentialsExport = {
  firebaseProjectId: string;
  accounts: DemoCredential[];
};

function getActionCode(actionLink: string) {
  const code = new URL(actionLink).searchParams.get("oobCode");
  if (!code) throw new Error("Firebase did not return an email action code.");
  return code;
}

async function identityToolkitRequest(
  action: string,
  apiKey: string,
  body: Record<string, unknown>,
  step = action,
): Promise<Record<string, unknown>> {
  currentStep = step;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/${action}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    // Keep the failure message below free of response bodies and credentials.
  }
  if (!response.ok) {
    const error = payload.error;
    const message = error && typeof error === "object" && "message" in error
      ? String(error.message).split(":")[0]
      : "REQUEST_FAILED";
    throw new Error(`${action} failed (${response.status}, ${message}).`);
  }
  return payload;
}

async function run() {
  currentStep = "checking Firebase configuration";
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("EXPO_PUBLIC_FIREBASE_API_KEY is required.");
  if (getFirebaseAdminApp().options.projectId !== firebaseProjectId) {
    throw new Error("The Firebase Admin credentials do not match the Dukaan Saathi project.");
  }

  currentStep = "reading the private demo credential export";
  const credentials = JSON.parse(
    await readFile(credentialsFilePath, "utf8"),
  ) as CredentialsExport;
  if (
    credentials.firebaseProjectId !== firebaseProjectId ||
    credentials.accounts.length !== 7 ||
    credentials.accounts.some((account) => !account.email || account.password.length < 8)
  ) {
    throw new Error("The private demo credential export is missing or incomplete.");
  }

  const sendEmailCanary = process.argv.includes("--send-email-canary");
  if (sendEmailCanary) {
    if (!emailDeliveryTestAccount ||
      emailDeliveryTestAccount.endsWith("@example.com") ||
      !credentials.accounts.some((account) => account.email.toLowerCase() === emailDeliveryTestAccount)
    ) {
      throw new Error(
        "Email canary requires DEMO_EMAIL_CANARY_ACCOUNT set to an owned, deliverable " +
        "mailbox already present in the private credential export. Reserved example.com " +
        "demo addresses cannot receive mail.",
      );
    }
  }

  const auth = getFirebaseAdminAuth();
  let signInsPassed = 0;
  let verificationActionsPassed = 0;
  let passwordResetActionsPassed = 0;
  let verificationEmailsAccepted = 0;
  let resetEmailsAccepted = 0;
  const emailDeliveryErrors: string[] = [];

  for (const account of credentials.accounts) {
    currentStep = "loading demo account";
    const user = await auth.getUserByEmail(account.email);
    if (user.disabled) throw new Error("A demo account is disabled.");
    const originalEmailVerified = user.emailVerified;

    try {
      // Exercise the verification path even for accounts already verified,
      // then restore the original account state in the finally block.
      currentStep = "temporarily preparing email verification";
      await auth.updateUser(user.uid, { emailVerified: false });
      const signIn = await identityToolkitRequest("accounts:signInWithPassword", apiKey, {
        email: account.email,
        password: account.password,
        returnSecureToken: true,
      });
      if (signIn.localId !== user.uid || typeof signIn.idToken !== "string") {
        throw new Error("A demo account could not sign in with its seeded password.");
      }
      signInsPassed += 1;

      if (sendEmailCanary && account.email === emailDeliveryTestAccount) {
        try {
          await identityToolkitRequest("accounts:sendOobCode", apiKey, {
            requestType: "VERIFY_EMAIL",
            idToken: signIn.idToken,
          }, "requesting a verification email");
          verificationEmailsAccepted += 1;
        } catch (error) {
          emailDeliveryErrors.push(
            error instanceof Error ? error.message : "Verification email request failed.",
          );
        }
        try {
          await identityToolkitRequest("accounts:sendOobCode", apiKey, {
            requestType: "PASSWORD_RESET",
            email: account.email,
          }, "requesting a password reset email");
          resetEmailsAccepted += 1;
        } catch (error) {
          emailDeliveryErrors.push(
            error instanceof Error ? error.message : "Password reset email request failed.",
          );
        }
      }

      currentStep = "generating an email verification action code";
      const verificationLink = await auth.generateEmailVerificationLink(account.email);
      await identityToolkitRequest("accounts:update", apiKey, {
        oobCode: getActionCode(verificationLink),
      });
      if (!(await auth.getUser(user.uid)).emailVerified) {
        throw new Error("Firebase did not apply the email verification action code.");
      }
      verificationActionsPassed += 1;

      currentStep = "generating a password reset action code";
      const resetLink = await auth.generatePasswordResetLink(account.email);
      await identityToolkitRequest("accounts:resetPassword", apiKey, {
        oobCode: getActionCode(resetLink),
        newPassword: account.password,
      });
      const resetSignIn = await identityToolkitRequest("accounts:signInWithPassword", apiKey, {
        email: account.email,
        password: account.password,
        returnSecureToken: true,
      });
      if (resetSignIn.localId !== user.uid) {
        throw new Error("Firebase password reset did not leave the demo account sign-in usable.");
      }
      passwordResetActionsPassed += 1;
    } catch (error) {
      failureStep = currentStep;
      throw error;
    } finally {
      currentStep = "restoring the account's original verification state";
      try {
        await auth.updateUser(user.uid, { emailVerified: originalEmailVerified });
      } catch (error) {
        if (!failureStep) failureStep = currentStep;
        throw error;
      }
    }
  }

  console.log(JSON.stringify({
    success: true,
    accountsTested: credentials.accounts.length,
    signInsPassed,
    verificationActionsPassed,
    passwordResetActionsPassed,
    verificationEmailsAccepted,
    resetEmailsAccepted,
    emailDeliveryErrors,
    emailVerificationStatesRestored: true,
    passwordValuesPreserved: true,
  }));
}

run().catch((error: unknown) => {
  console.error(
    `Firebase Auth flow test failed while ${failureStep ?? currentStep}:`,
    error instanceof Error ? error.message : "Unknown error.",
  );
  process.exitCode = 1;
});
