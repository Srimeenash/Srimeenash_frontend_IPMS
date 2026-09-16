import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Eye,
  EyeOff,
  Gauge,
  Lock,
  Mail,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";

import { useAuth } from "../AuthContext";
import config from "@/config";


const LOGIN_STYLES = String.raw`
:root {
  --pink: #E85D75;
  --pink-2: #ff7890;
  --bg: #07111f;
  --bg-2: #0a1728;
  --panel: rgba(10, 23, 40, 0.78);
  --panel-strong: rgba(11, 25, 43, 0.92);
  --line: rgba(148, 163, 184, 0.14);
  --text: #f8fafc;
  --muted: #92a3b8;
  --field: rgba(255, 255, 255, 0.06);
  --field-border: rgba(255, 255, 255, 0.12);
}

* {
  box-sizing: border-box;
}

.ipms-login-v2 {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 28px;
  background:
    radial-gradient(circle at 14% 22%, rgba(232, 93, 117, 0.14), transparent 26%),
    radial-gradient(circle at 84% 18%, rgba(59, 130, 246, 0.10), transparent 28%),
    linear-gradient(180deg, #07111f 0%, #091522 100%);
  color: var(--text);
  isolation: isolate;
}

.ipms-login-v2::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(circle at center, #000 45%, transparent 92%);
  animation: loginGridMove 22s linear infinite;
  z-index: -5;
}

@keyframes loginGridMove {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(46px, 46px, 0); }
}

.ipms-login-v2__mouse-glow {
  position: absolute;
  width: 440px;
  height: 440px;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, rgba(232,93,117,0.12), rgba(232,93,117,0.03) 34%, transparent 70%);
  filter: blur(8px);
  transform: translate(-50%, -50%);
  z-index: -3;
  transition: left 120ms linear, top 120ms linear;
}

.ipms-login-v2__aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(30px);
  opacity: 0.45;
  z-index: -4;
  animation: auroraDrift 12s ease-in-out infinite alternate;
}

.ipms-login-v2__aurora--a {
  width: 420px;
  height: 420px;
  left: -120px;
  bottom: -110px;
  background: radial-gradient(circle, rgba(232,93,117,0.22), transparent 66%);
}

.ipms-login-v2__aurora--b {
  width: 500px;
  height: 500px;
  right: -160px;
  top: -150px;
  background: radial-gradient(circle, rgba(59,130,246,0.16), transparent 66%);
  animation-delay: -3s;
}

@keyframes auroraDrift {
  0% { transform: translate3d(0,0,0) scale(1); }
  100% { transform: translate3d(30px,-22px,0) scale(1.08); }
}

.ipms-login-v2__streams {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: -2;
}

.ipms-login-v2__stream {
  position: absolute;
  height: 1px;
  width: 360px;
  background: linear-gradient(90deg, transparent, rgba(232,93,117,0.38), transparent);
  opacity: 0.55;
  animation: dataStream 8s linear infinite;
}

.ipms-login-v2__stream--1 {
  left: -120px;
  top: 22%;
}

.ipms-login-v2__stream--2 {
  right: -160px;
  top: 68%;
  animation-delay: -2.4s;
}

.ipms-login-v2__stream--3 {
  left: 10%;
  bottom: 12%;
  width: 520px;
  opacity: 0.24;
  animation-delay: -4.8s;
}

@keyframes dataStream {
  from { transform: translateX(-25%) scaleX(.8); }
  50% { opacity: .85; }
  to { transform: translateX(180%) scaleX(1.12); }
}

.ipms-login-v2__frame {
  width: min(1120px, 100%);
  min-height: 650px;
  display: grid;
  grid-template-columns: 1.1fr .9fr;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 30px;
  background: rgba(7,17,31,0.70);
  box-shadow:
    0 35px 100px rgba(0,0,0,0.42),
    inset 0 1px 0 rgba(255,255,255,0.04);
  backdrop-filter: blur(26px);
}

.ipms-login-v2__visual {
  position: relative;
  padding: 48px;
  border-right: 1px solid rgba(255,255,255,0.08);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.018), transparent),
    radial-gradient(circle at 50% 46%, rgba(232,93,117,0.075), transparent 30%);
}

.ipms-login-v2__brand {
  display: flex;
  align-items: center;
  gap: 13px;
}

.ipms-login-v2__brand-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: var(--pink);
  background: rgba(232,93,117,.10);
  border: 1px solid rgba(232,93,117,.18);
}

.ipms-login-v2__brand strong {
  display: block;
  font-size: 19px;
  letter-spacing: -.02em;
}

.ipms-login-v2__brand span {
  display: block;
  margin-top: 4px;
  color: #7f91a8;
  font-size: 10px;
  line-height: 1.4;
}

.ipms-login-v2__copy {
  margin-top: 58px;
  max-width: 560px;
}

.ipms-login-v2__kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--pink);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .12em;
}

.ipms-login-v2__copy h1 {
  margin: 15px 0 0;
  max-width: 520px;
  font-size: clamp(38px, 4vw, 58px);
  line-height: 1.03;
  letter-spacing: -.045em;
  font-weight: 760;
}

.ipms-login-v2__copy p {
  margin: 18px 0 0;
  max-width: 500px;
  color: #91a2b8;
  font-size: 13px;
  line-height: 1.75;
}

/* Animated warehouse / procurement network */
.ipms-login-v2__network {
  position: relative;
  height: 290px;
  margin-top: 32px;
}

.ipms-login-v2__warehouse {
  position: absolute;
  left: 50%;
  top: 48%;
  width: 130px;
  height: 100px;
  transform: translate(-50%, -50%);
  border-radius: 22px;
  border: 1px solid rgba(232,93,117,.22);
  background: linear-gradient(145deg, rgba(232,93,117,.13), rgba(255,255,255,.03));
  box-shadow:
    0 0 0 10px rgba(232,93,117,.03),
    0 18px 55px rgba(0,0,0,.28);
  display: grid;
  place-items: center;
  color: var(--pink);
  animation: warehousePulse 3s ease-in-out infinite;
}

@keyframes warehousePulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.035); }
}

.ipms-login-v2__warehouse::after {
  content: "LIVE";
  position: absolute;
  right: 10px;
  top: 10px;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(34,197,94,.10);
  color: #4ade80;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: .08em;
}

.ipms-login-v2__route {
  position: absolute;
  left: 50%;
  top: 48%;
  height: 1px;
  width: 35%;
  transform-origin: left center;
  background: linear-gradient(90deg, rgba(232,93,117,.45), transparent);
}

.ipms-login-v2__route--1 { transform: rotate(205deg); }
.ipms-login-v2__route--2 { transform: rotate(335deg); }
.ipms-login-v2__route--3 { transform: rotate(145deg); }
.ipms-login-v2__route--4 { transform: rotate(25deg); }

.ipms-login-v2__chip {
  position: absolute;
  min-width: 126px;
  padding: 11px 12px;
  border-radius: 14px;
  background: rgba(8,20,35,.88);
  border: 1px solid rgba(148,163,184,.14);
  box-shadow: 0 16px 34px rgba(0,0,0,.20);
  animation: chipFloat 4.8s ease-in-out infinite;
}

.ipms-login-v2__chip strong {
  display: block;
  color: #e5edf6;
  font-size: 10px;
}

.ipms-login-v2__chip span {
  display: block;
  margin-top: 4px;
  color: #71839a;
  font-size: 8px;
}

.ipms-login-v2__chip--1 { left: 2%; top: 14%; animation-delay: -1s; }
.ipms-login-v2__chip--2 { right: 2%; top: 18%; animation-delay: -2.2s; }
.ipms-login-v2__chip--3 { left: 7%; bottom: 12%; animation-delay: -3.1s; }
.ipms-login-v2__chip--4 { right: 7%; bottom: 10%; animation-delay: -.5s; }

@keyframes chipFloat {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.ipms-login-v2__form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 44px;
  background: rgba(8,18,32,0.80);
}

.ipms-login-v2__form-card {
  width: 100%;
  max-width: 390px;
}

.ipms-login-v2__form-head span {
  color: var(--pink);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .12em;
}

.ipms-login-v2__form-head h2 {
  margin: 10px 0 0;
  font-size: 30px;
  line-height: 1.1;
  letter-spacing: -.035em;
}

.ipms-login-v2__form-head p {
  margin: 8px 0 0;
  color: #8294aa;
  font-size: 11px;
  line-height: 1.6;
}

.ipms-login-v2__form {
  display: grid;
  gap: 16px;
  margin-top: 28px;
}

.ipms-login-v2__error {
  display: flex;
  gap: 8px;
  padding: 10px 11px;
  border: 1px solid rgba(248,113,113,.28);
  border-radius: 11px;
  background: rgba(127,29,29,.16);
  color: #fda4af;
  font-size: 11px;
}

.ipms-login-v2__field {
  display: grid;
  gap: 7px;
}

.ipms-login-v2__field > span {
  color: #cbd5e1;
  font-size: 10px;
  font-weight: 700;
}

.ipms-login-v2__input-wrap {
  position: relative;
}

.ipms-login-v2__input-icon {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  color: #718096;
  pointer-events: none;
}

.ipms-login-v2__input-wrap input {
  width: 100%;
  height: 47px;
  padding: 0 42px 0 40px;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  outline: none;
  background: var(--field);
  color: #f8fafc;
  font: inherit;
  font-size: 11px;
  transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
}

.ipms-login-v2__input-wrap input::placeholder {
  color: #5f7085;
}

.ipms-login-v2__input-wrap input:focus {
  border-color: rgba(232,93,117,.58);
  box-shadow: 0 0 0 4px rgba(232,93,117,.08);
  background: rgba(255,255,255,.075);
}

.ipms-login-v2__password-toggle {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #718096;
  cursor: pointer;
}

.ipms-login-v2__password-toggle:hover {
  background: rgba(255,255,255,.06);
  color: #cbd5e1;
}

.ipms-login-v2__submit {
  height: 48px;
  margin-top: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--pink), var(--pink-2));
  color: white;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 16px 34px rgba(232,93,117,.24);
  transition: transform .16s ease, box-shadow .16s ease;
}

.ipms-login-v2__submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 20px 40px rgba(232,93,117,.30);
}

.ipms-login-v2__submit:disabled {
  opacity: .62;
  cursor: not-allowed;
}

.ipms-login-v2__meta {
  margin-top: 20px;
  text-align: center;
  color: #7e8fa4;
  font-size: 10px;
}

.ipms-login-v2__meta a {
  color: var(--pink);
  font-weight: 800;
  text-decoration: none;
}

.ipms-login-v2__meta a:hover {
  text-decoration: underline;
}

.ipms-login-v2__security {
  margin-top: 18px;
  display: flex;
  justify-content: center;
  gap: 8px;
  color: #52657b;
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: .08em;
}


.ipms-login-v2__otp-note {
  padding: 11px 12px;
  border: 1px solid rgba(96, 165, 250, 0.22);
  border-radius: 11px;
  background: rgba(30, 64, 175, 0.10);
  color: #bfdbfe;
  font-size: 10px;
  line-height: 1.6;
}

.ipms-login-v2__otp-email {
  color: #f8fafc;
  font-weight: 800;
  word-break: break-word;
}

.ipms-login-v2__otp-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: -2px;
}

.ipms-login-v2__text-button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--pink);
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}

.ipms-login-v2__text-button:disabled {
  color: #5f7085;
  cursor: not-allowed;
}

.ipms-login-v2__timer {
  color: #718096;
  font-size: 9px;
}

.ipms-login-v2__input-wrap input.ipms-login-v2__otp-input {
  padding-right: 14px;
  letter-spacing: 8px;
  font-size: 18px;
  font-weight: 800;
  text-align: center;
}

@media (max-width: 980px) {
  .ipms-login-v2__frame {
    grid-template-columns: 1fr;
    max-width: 520px;
    min-height: auto;
  }

  .ipms-login-v2__visual {
    display: none;
  }

  .ipms-login-v2__form-panel {
    min-height: 600px;
    padding: 40px 28px;
  }
}

@media (max-width: 560px) {
  .ipms-login-v2 {
    padding: 14px;
  }

  .ipms-login-v2__frame {
    border-radius: 22px;
  }

  .ipms-login-v2__form-panel {
    min-height: 560px;
    padding: 30px 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ipms-login-v2 *,
  .ipms-login-v2 *::before,
  .ipms-login-v2 *::after {
    animation: none !important;
    transition: none !important;
  }
}
`;


function redirectByRole(role, navigate) {
  switch (String(role || "").trim().toLowerCase()) {
    case "admin":
    case "manager":
      navigate("/dashboard", { replace: true });
      break;
    case "procurement":
      navigate("/procurement", { replace: true });
      break;
    case "inventory":
      navigate("/inventory", { replace: true });
      break;
    case "finance":
      navigate("/finance", { replace: true });
      break;
    case "management":
      navigate("/management-notifications", { replace: true });
      break;
    case "engineer":
      navigate("/engineer", { replace: true });
      break;
    case "vendor":
      navigate("/vendor", { replace: true });
      break;
    default:
      navigate("/dashboard", { replace: true });
      break;
  }
}


export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pointer, setPointer] = useState({ x: 52, y: 44 });

  const [loginStep, setLoginStep] = useState("credentials");
  const [verificationId, setVerificationId] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [resendAfter, setResendAfter] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);

  const navigate = useNavigate();
  const { login } = useAuth();

  const glowStyle = useMemo(
    () => ({
      left: `${pointer.x}%`,
      top: `${pointer.y}%`,
    }),
    [pointer],
  );

  useEffect(() => {
    if (loginStep !== "otp") return undefined;

    const timer = window.setInterval(() => {
      setResendAfter((value) => Math.max(0, value - 1));
      setExpiresIn((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loginStep]);

  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setPointer({ x, y });
  };

  const readJson = async (response) => {
    try {
      return await response.json();
    } catch (_error) {
      return {};
    }
  };

  const getErrorMessage = (data, fallback) => {
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail) && data.detail[0]) return data.detail[0];
    if (Array.isArray(data?.non_field_errors) && data.non_field_errors[0]) {
      return data.non_field_errors[0];
    }
    return fallback;
  };

  const finishLogin = (data) => {
    if (!data?.access || !data?.refresh || !data?.user) {
      throw new Error("Login completed but the server did not return a valid session.");
    }

    login({
      access: data.access,
      refresh: data.refresh,
      user: data.user,
    });

    redirectByRole(
      data?.active_role ||
        data?.user?.active_role ||
        data?.user?.role,
      navigate,
    );
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setOtpMessage("");

    try {
      const response = await fetch(`${config.baseURL}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Invalid email or password."),
        );
      }

      const hasSession = Boolean(
        data?.access &&
          data?.refresh &&
          data?.user,
      );

      if (data?.verification_required && !hasSession) {
        setVerificationId(String(data?.verification_id || ""));
        setVerificationEmail(String(data?.email || email.trim()));
        setResendAfter(Number(data?.resend_after || 0));
        setExpiresIn(Number(data?.expires_in || 0));
        setOtp("");
        setOtpMessage(
          data?.detail || "A verification code was sent to your email.",
        );
        setLoginStep("otp");
        return;
      }

      finishLogin(data);
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Unable to connect to the server.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setError("");
    setOtpMessage("");

    if (!verificationId) {
      setError("Verification session is missing. Please sign in again.");
      setLoginStep("credentials");
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${config.baseURL}/auth/login/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_id: verificationId,
          code: otp,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Unable to verify the code."),
        );
      }

      finishLogin(data);
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Unable to verify the code.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!verificationId || resendAfter > 0 || isLoading) return;

    setIsLoading(true);
    setError("");
    setOtpMessage("");

    try {
      const response = await fetch(`${config.baseURL}/auth/login/resend/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_id: verificationId,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        if (Number(data?.retry_after || 0) > 0) {
          setResendAfter(Number(data.retry_after));
        }
        throw new Error(
          getErrorMessage(data, "Unable to resend the verification code."),
        );
      }

      setVerificationId(String(data?.verification_id || verificationId));
      setVerificationEmail(String(data?.email || verificationEmail));
      setResendAfter(Number(data?.resend_after || 60));
      setExpiresIn(Number(data?.expires_in || 0));
      setOtp("");
      setOtpMessage(data?.detail || "A new verification code was sent.");
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Unable to resend the verification code.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setLoginStep("credentials");
    setVerificationId("");
    setVerificationEmail("");
    setOtp("");
    setOtpMessage("");
    setResendAfter(0);
    setExpiresIn(0);
    setError("");
    setPassword("");
  };

  const formatSeconds = (value) => {
    const safeValue = Math.max(0, Number(value || 0));
    const minutes = Math.floor(safeValue / 60);
    const seconds = safeValue % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <>
      <style>{LOGIN_STYLES}</style>

      <main
        className="ipms-login-v2"
        onMouseMove={handlePointerMove}
      >
        <div
          className="ipms-login-v2__mouse-glow"
          style={glowStyle}
        />
        <div className="ipms-login-v2__aurora ipms-login-v2__aurora--a" />
        <div className="ipms-login-v2__aurora ipms-login-v2__aurora--b" />

        <div className="ipms-login-v2__streams" aria-hidden="true">
          <div className="ipms-login-v2__stream ipms-login-v2__stream--1" />
          <div className="ipms-login-v2__stream ipms-login-v2__stream--2" />
          <div className="ipms-login-v2__stream ipms-login-v2__stream--3" />
        </div>

        <section className="ipms-login-v2__frame">
          <div className="ipms-login-v2__visual">
            <div className="ipms-login-v2__brand">
              <div className="ipms-login-v2__brand-icon">
                <Boxes size={22} />
              </div>
              <div>
                <strong>IPMS</strong>
                <span>
                  Inventory & Procurement
                  <br />
                  Management System
                </span>
              </div>
            </div>

            <div className="ipms-login-v2__copy">
              <span className="ipms-login-v2__kicker">
                <Sparkles size={13} />
                Intelligent Operations
              </span>

              <h1>
                Control every material movement
                from one workspace.
              </h1>

              <p>
                Track inventory, purchasing, inward,
                outward and approvals with a live,
                connected operational view.
              </p>
            </div>

            <div className="ipms-login-v2__network">
              <div className="ipms-login-v2__route ipms-login-v2__route--1" />
              <div className="ipms-login-v2__route ipms-login-v2__route--2" />
              <div className="ipms-login-v2__route ipms-login-v2__route--3" />
              <div className="ipms-login-v2__route ipms-login-v2__route--4" />

              <div className="ipms-login-v2__warehouse">
                <Boxes size={32} />
              </div>

              <div className="ipms-login-v2__chip ipms-login-v2__chip--1">
                <strong>Inventory</strong>
                <span>Stock visibility</span>
              </div>

              <div className="ipms-login-v2__chip ipms-login-v2__chip--2">
                <strong>Procurement</strong>
                <span>PO & vendor flow</span>
              </div>

              <div className="ipms-login-v2__chip ipms-login-v2__chip--3">
                <strong>Inward / QC</strong>
                <span>Traceable receipt</span>
              </div>

              <div className="ipms-login-v2__chip ipms-login-v2__chip--4">
                <strong>Approvals</strong>
                <span>Controlled workflow</span>
              </div>
            </div>
          </div>

          <div className="ipms-login-v2__form-panel">
            <div className="ipms-login-v2__form-card">
              <div className="ipms-login-v2__form-head">
                <span>Secure workspace</span>
                <h2>
                  {loginStep === "otp"
                    ? "Verify your email"
                    : "Welcome back"}
                </h2>
                <p>
                  {loginStep === "otp"
                    ? "Enter the verification code sent to your email address."
                    : "Sign in with your authorized IPMS credentials."}
                </p>
              </div>

              {loginStep === "credentials" ? (
                <form
                  onSubmit={handleLogin}
                  className="ipms-login-v2__form"
                >
                  {error && (
                    <div
                      className="ipms-login-v2__error"
                      role="alert"
                    >
                      <AlertCircle size={16} />
                      <span>{error}</span>
                    </div>
                  )}

                  <label className="ipms-login-v2__field">
                    <span>Email address</span>
                    <div className="ipms-login-v2__input-wrap">
                      <Mail
                        className="ipms-login-v2__input-icon"
                        size={16}
                      />
                      <input
                        type="email"
                        value={email}
                        onChange={(event) =>
                          setEmail(event.target.value)
                        }
                        placeholder="name@company.com"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </label>

                  <label className="ipms-login-v2__field">
                    <span>Password</span>
                    <div className="ipms-login-v2__input-wrap">
                      <Lock
                        className="ipms-login-v2__input-icon"
                        size={16}
                      />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value)
                        }
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        className="ipms-login-v2__password-toggle"
                        onClick={() =>
                          setShowPassword((value) => !value)
                        }
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </label>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="ipms-login-v2__submit"
                  >
                    <span>
                      {isLoading
                        ? "Authenticating..."
                        : "Sign in"}
                    </span>
                    {!isLoading && <ArrowRight size={16} />}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={handleVerifyOtp}
                  className="ipms-login-v2__form"
                >
                  {error && (
                    <div
                      className="ipms-login-v2__error"
                      role="alert"
                    >
                      <AlertCircle size={16} />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="ipms-login-v2__otp-note">
                    {otpMessage || "Verification code sent."}
                    <br />
                    <span className="ipms-login-v2__otp-email">
                      {verificationEmail}
                    </span>
                  </div>

                  <label className="ipms-login-v2__field">
                    <span>Verification code</span>
                    <div className="ipms-login-v2__input-wrap">
                      <Lock
                        className="ipms-login-v2__input-icon"
                        size={16}
                      />
                      <input
                        className="ipms-login-v2__otp-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={otp}
                        onChange={(event) =>
                          setOtp(
                            event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 6),
                          )
                        }
                        placeholder="000000"
                        autoComplete="one-time-code"
                        autoFocus
                        required
                      />
                    </div>
                  </label>

                  <div className="ipms-login-v2__otp-actions">
                    <button
                      type="button"
                      className="ipms-login-v2__text-button"
                      disabled={resendAfter > 0 || isLoading}
                      onClick={handleResendOtp}
                    >
                      {resendAfter > 0
                        ? `Resend in ${resendAfter}s`
                        : "Resend OTP"}
                    </button>

                    {expiresIn > 0 && (
                      <span className="ipms-login-v2__timer">
                        Expires in {formatSeconds(expiresIn)}
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || otp.length !== 6}
                    className="ipms-login-v2__submit"
                  >
                    <span>
                      {isLoading
                        ? "Verifying..."
                        : "Verify OTP"}
                    </span>
                    {!isLoading && <ShieldCheck size={16} />}
                  </button>
                </form>
              )}

              <p className="ipms-login-v2__meta">
                {loginStep === "otp" ? (
                  <button
                    type="button"
                    className="ipms-login-v2__text-button"
                    onClick={handleBackToLogin}
                  >
                    Back to sign in
                  </button>
                ) : (
                  <>
                    Need access to IPMS?{" "}
                    <a
                      href="mailto:Srimeenash.r@aero360.co.in?subject=IPMS%20access%20request&body=Hello%20Admin%2C%0A%0APlease%20help%20me%20get%20access%20to%20IPMS.%0A%0ARegards%2C"
                    >
                      Contact admin
                    </a>
                  </>
                )}
              </p>

              <div className="ipms-login-v2__security">
                <ShieldCheck size={12} />
                role-based secure access
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
