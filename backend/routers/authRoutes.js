import express from "express";
import { forgotPassword, resetPassword } from "../controllers/authController.js";
import { validate } from "../middlewares/validate.js";
import {
  forgotPasswordRateLimiter,
  loginRateLimiter,
  otpVerificationRateLimiter,
  resetPasswordRateLimiter,
  signupRateLimiter,
} from "../middlewares/rateLimiter.js";
import { authSchemas } from "../validation/schemas.js";

const router = express.Router();

export const authRouteRateLimiters = {
  loginRateLimiter,
  signupRateLimiter,
  otpVerificationRateLimiter,
};

router.post(
  "/forgot-password",
  forgotPasswordRateLimiter,
  validate(authSchemas.forgotPassword),
  forgotPassword
);
router.post(
  "/reset-password/:token",
  resetPasswordRateLimiter,
  validate(authSchemas.resetPassword),
  resetPassword
);
router.post("/login", loginRateLimiter, validate(authSchemas.login), (req, res) => {
  res.json({ message: "Login route working" });
});

export default router;