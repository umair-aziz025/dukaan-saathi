import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dukaanRouter from "./dukaan";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dukaanRouter);

export default router;
