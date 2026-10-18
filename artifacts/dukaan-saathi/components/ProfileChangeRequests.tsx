import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDukaanAdminProfileChangeRequestsQueryKey,
  getGetDukaanProfileChangeRequestsQueryKey,
  getGetDukaanProfileQueryKey,
  useCreateDukaanProfileChangeRequest,
  useGetDukaanAdminProfileChangeRequests,
  useGetDukaanProfileChangeRequests,
  useReviewDukaanProfileChangeRequest,
} from '@workspace/api-client-react';
import type { ProfileChangeRequest, ProfileChangeRequestField, ProfileChangeRequestStatus } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { AppButton, Field, Notice, Panel, SectionHeading } from '@/components/saathi-ui';

type ProfileSummary = {
  name: string;
  email: string;
  phone: string;
};

const fieldLabels: Record<ProfileChangeRequestField, string> = {
  name: 'Full name',
  phone: 'Phone number',
};

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message.replace(/^HTTP \d+[^:]*:\s*/, '').slice(0, 220);
  }
  return fallback;
}

function StatusBadge({ status }: { status: ProfileChangeRequestStatus }) {
  const colors = useColors();
  const tint = status === 'approved'
    ? '#2E7350'
    : status === 'rejected'
      ? colors.destructive
      : '#A96721';
  return (
    <View style={[styles.statusBadge, { backgroundColor: `${tint}14`, borderColor: `${tint}42` }]}>
      <Text style={[styles.statusText, { color: tint }]}>{status}</Text>
    </View>
  );
}

export function ProfileChangeRequestsView({
  profile,
  children,
}: {
  profile: ProfileSummary;
  children?: React.ReactNode;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [field, setField] = useState<ProfileChangeRequestField>('name');
  const [requestedValue, setRequestedValue] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning'>('success');
  const profileRefreshKey = useRef('');
  const requestsQuery = useGetDukaanProfileChangeRequests({
    query: {
      queryKey: getGetDukaanProfileChangeRequestsQueryKey(),
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchInterval: 8_000,
    },
  });
  const createRequest = useCreateDukaanProfileChangeRequest();
  const requests = requestsQuery.data?.requests ?? [];
  const pendingField = requests.find((request) => request.status === 'pending' && request.field === field);
  const approvedRequestIds = requests
    .filter((request) => request.status === 'approved')
    .map((request) => request.id)
    .join(':');

  useEffect(() => {
    if (approvedRequestIds && profileRefreshKey.current !== approvedRequestIds) {
      profileRefreshKey.current = approvedRequestIds;
      void queryClient.invalidateQueries({ queryKey: getGetDukaanProfileQueryKey() });
    }
  }, [approvedRequestIds, queryClient]);

  const submitRequest = async () => {
    const value = requestedValue.trim().replace(/\s+/g, ' ');
    if (value.length < 2 || (field === 'name' && value.length > 80)) {
      setMessageTone('warning');
      setMessage(field === 'name'
        ? 'Enter a name between 2 and 80 characters.'
        : 'Enter a valid phone number.');
      return;
    }
    if (pendingField) {
      setMessageTone('warning');
      setMessage(`A ${fieldLabels[field].toLowerCase()} request is already awaiting review.`);
      return;
    }
    setMessage('');
    try {
      await createRequest.mutateAsync({ data: { field, requestedValue: value } });
      setRequestedValue('');
      setMessageTone('success');
      setMessage('Request sent. Your current profile will stay unchanged until an admin approves it.');
      await queryClient.invalidateQueries({ queryKey: getGetDukaanProfileChangeRequestsQueryKey() });
    } catch (error) {
      setMessageTone('warning');
      setMessage(errorText(error, 'Could not send your request. Please try again.'));
    }
  };

  return (
    <Panel>
        <SectionHeading
          title="Profile"
          detail="Your personal and shop details, profile requests, and review history."
        />
        <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Full name</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>{profile.name}</Text>
        </View>
        <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Phone number</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>{profile.phone || 'Not provided'}</Text>
        </View>
        <View style={[styles.profileRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Verified email</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>{profile.email}</Text>
        </View>
        <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
          Email and identity details are read-only here.
        </Text>

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
        <SectionHeading title="Request a profile change" detail="Choose one detail to update." />
        <View style={styles.choiceRow}>
          {(['name', 'phone'] as const).map((choice) => {
            const selected = field === choice;
            return (
              <Pressable
                key={choice}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setField(choice);
                  setMessage('');
                }}
                style={[
                  styles.fieldChoice,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ color: selected ? colors.primaryForeground : colors.foreground, fontWeight: '700', fontSize: 12 }}>
                  {fieldLabels[choice]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Field
          label={`New ${fieldLabels[field].toLowerCase()}`}
          value={requestedValue}
          onChangeText={setRequestedValue}
          autoCapitalize={field === 'name' ? 'words' : 'none'}
          autoCorrect={field === 'name'}
          keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
          placeholder={field === 'phone' ? '03XXXXXXXXX' : 'Enter your name'}
          maxLength={field === 'name' ? 80 : 20}
          testID="profile-change-request-value"
        />
        {pendingField ? (
          <Notice>A request for this detail is pending. Wait for its review before submitting another.</Notice>
        ) : null}
        {message ? <Notice tone={messageTone}>{message}</Notice> : null}
        <AppButton
          label="Send for admin review"
          icon="send"
          onPress={() => { void submitRequest(); }}
          loading={createRequest.isPending}
          disabled={Boolean(pendingField) || !requestedValue.trim()}
          testID="submit-profile-change-request"
        />

        {children ? (
          <>
            <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
            {children}
          </>
        ) : null}

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
        <SectionHeading title="Your change requests" detail="Request status and review details." />
        {requestsQuery.isLoading && requests.length === 0 ? (
          <View style={styles.inline}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>Loading requests…</Text>
          </View>
        ) : null}
        {requestsQuery.isError ? (
          <>
            <Notice tone="warning">{errorText(requestsQuery.error, 'Requests could not be loaded.')}</Notice>
            <AppButton label="Try again" icon="refresh-cw" compact onPress={() => { void requestsQuery.refetch(); }} />
          </>
        ) : null}
        {!requestsQuery.isLoading && !requestsQuery.isError && requests.length === 0 ? (
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>You have not submitted any profile changes.</Text>
        ) : null}
        {requests.map((request) => (
          <View key={request.id} style={[styles.requestCard, { borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.requestTitle, { color: colors.foreground }]}>{fieldLabels[request.field]}</Text>
              <StatusBadge status={request.status} />
            </View>
            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
              {request.currentValue || 'Not provided'} → {request.requestedValue}
            </Text>
            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
              Submitted {new Date(request.createdAt).toLocaleString()}
            </Text>
            {request.reviewedAt ? (
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                Reviewed by {request.reviewerName || 'admin'} · {new Date(request.reviewedAt).toLocaleString()}
              </Text>
            ) : null}
            {request.rejectionReason ? (
              <Notice tone="warning">Reason: {request.rejectionReason}</Notice>
            ) : null}
          </View>
        ))}
    </Panel>
  );
}

export function AdminProfileChangeRequestsView() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ProfileChangeRequestStatus>('pending');
  const [rejectingId, setRejectingId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning'>('success');
  const [busyId, setBusyId] = useState('');
  const requestsQuery = useGetDukaanAdminProfileChangeRequests(
    { status },
    {
      query: {
        queryKey: getGetDukaanAdminProfileChangeRequestsQueryKey({ status }),
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchInterval: status === 'pending' ? 12_000 : false,
      },
    },
  );
  const reviewRequest = useReviewDukaanProfileChangeRequest();
  const requests = requestsQuery.data?.requests ?? [];
  const filters: ProfileChangeRequestStatus[] = ['pending', 'approved', 'rejected'];

  const review = async (
    request: ProfileChangeRequest,
    decision: 'approved' | 'rejected',
    reason = '',
  ) => {
    setBusyId(request.id);
    setMessage('');
    try {
      await reviewRequest.mutateAsync({
        requestId: request.id,
        data: {
          status: decision,
          ...(decision === 'rejected' && reason.trim() ? { rejectionReason: reason.trim() } : {}),
        },
      });
      setMessageTone('success');
      setMessage(decision === 'approved'
        ? `${fieldLabels[request.field]} change approved for ${request.userName}.`
        : `Request rejected for ${request.userName}.`);
      setRejectingId('');
      setRejectionReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetDukaanAdminProfileChangeRequestsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDukaanProfileChangeRequestsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDukaanProfileQueryKey() }),
      ]);
    } catch (error) {
      setMessageTone('warning');
      setMessage(errorText(error, 'The request could not be reviewed.'));
    } finally {
      setBusyId('');
    }
  };

  return (
    <Panel>
      <SectionHeading title="Profile change requests" detail="Review requested customer and merchant profile updates." />
      <View style={styles.choiceRow}>
        {filters.map((filter) => {
          const selected = status === filter;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setStatus(filter);
                setRejectingId('');
                setMessage('');
              }}
              style={[
                styles.filterChoice,
                {
                  backgroundColor: selected ? colors.primary : colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={{ color: selected ? colors.primaryForeground : colors.foreground, fontSize: 12, fontWeight: '700' }}>
                {filter[0].toUpperCase() + filter.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {message ? <Notice tone={messageTone}>{message}</Notice> : null}
      {requestsQuery.isLoading && requests.length === 0 ? (
        <View style={styles.inline}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>Loading profile requests…</Text>
        </View>
      ) : null}
      {requestsQuery.isError ? (
        <>
          <Notice tone="warning">{errorText(requestsQuery.error, 'The request queue could not be loaded.')}</Notice>
          <AppButton label="Try again" icon="refresh-cw" compact onPress={() => { void requestsQuery.refetch(); }} />
        </>
      ) : null}
      {!requestsQuery.isLoading && !requestsQuery.isError && requests.length === 0 ? (
        <Text style={[styles.helperText, { color: colors.mutedForeground }]}>No {status} profile requests.</Text>
      ) : null}

      {requests.map((request) => {
        const rejecting = rejectingId === request.id;
        return (
          <View key={request.id} style={[styles.requestCard, { borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.requestTitle, { color: colors.foreground }]}>{request.userName}</Text>
                <Text style={[styles.helperText, { color: colors.mutedForeground }]}>{request.userEmail}</Text>
              </View>
              <StatusBadge status={request.status} />
            </View>
            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
              {request.userRole === 'merchant' ? 'Merchant' : 'Customer'} · {fieldLabels[request.field]}
            </Text>
            <View style={[styles.valueBox, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>Current value</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{request.currentValue || 'Not provided'}</Text>
            </View>
            <View style={[styles.valueBox, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>Requested value</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{request.requestedValue}</Text>
            </View>
            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
              Submitted {new Date(request.createdAt).toLocaleString()}
            </Text>
            {request.reviewedAt ? (
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                Reviewed by {request.reviewerName || request.reviewedBy || 'admin'} · {new Date(request.reviewedAt).toLocaleString()}
              </Text>
            ) : null}
            {request.rejectionReason ? <Notice tone="warning">Reason: {request.rejectionReason}</Notice> : null}
            {request.status === 'pending' ? (
              rejecting ? (
                <>
                  <Field
                    label="Rejection reason (optional)"
                    value={rejectionReason}
                    onChangeText={setRejectionReason}
                    multiline
                    maxLength={300}
                    placeholder="Add a short reason for the user"
                    testID={`profile-rejection-reason-${request.id}`}
                  />
                  <View style={styles.actionRow}>
                    <AppButton
                      label="Confirm rejection"
                      variant="danger"
                      onPress={() => { void review(request, 'rejected', rejectionReason); }}
                      loading={busyId === request.id}
                      disabled={Boolean(busyId)}
                    />
                    <AppButton
                      label="Cancel"
                      variant="outline"
                      onPress={() => {
                        setRejectingId('');
                        setRejectionReason('');
                      }}
                      disabled={Boolean(busyId)}
                    />
                  </View>
                </>
              ) : (
                <View style={styles.actionRow}>
                  <AppButton
                    label="Approve"
                    icon="check"
                    onPress={() => { void review(request, 'approved'); }}
                    loading={busyId === request.id}
                    disabled={Boolean(busyId)}
                  />
                  <AppButton
                    label="Reject"
                    icon="x"
                    variant="danger"
                    onPress={() => {
                      setRejectingId(request.id);
                      setRejectionReason('');
                    }}
                    disabled={Boolean(busyId)}
                  />
                </View>
              )
            ) : null}
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  profileRow: { gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  sectionDivider: { width: '100%', height: StyleSheet.hairlineWidth, marginVertical: 6 },
  label: { fontSize: 11, fontWeight: '700' },
  value: { fontSize: 14, fontWeight: '700' },
  helperText: { fontSize: 12, lineHeight: 18 },
  choiceRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  fieldChoice: { flex: 1, minWidth: 110, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 12 },
  filterChoice: { minWidth: 84, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderRadius: 100 },
  requestCard: { gap: 8, borderWidth: 1, borderRadius: 16, padding: 13, marginTop: 12 },
  requestTitle: { fontSize: 14, fontWeight: '700' },
  statusBadge: { paddingVertical: 5, paddingHorizontal: 9, borderWidth: 1, borderRadius: 100 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valueBox: { gap: 3, borderRadius: 12, padding: 10 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
