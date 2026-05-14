import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

router.post("/register", AuthController.register);
router.post("/verify-otp", AuthController.verifyOtp);
router.post("/resend-otp", AuthController.resendOtp);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);
router.post("/login", AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/me", authenticate, AuthController.getMe);
router.patch("/me/password", authenticate, AuthController.changePassword);
router.patch("/me/geolocation", authenticate, AuthController.updateMeGeolocation);

export default router;
