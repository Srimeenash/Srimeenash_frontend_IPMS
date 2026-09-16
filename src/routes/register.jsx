import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Cpu,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Network,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
} from "lucide-react";

import config from "@/config";


const REGISTER_STYLES = String.raw`
:root {
  --reg-pink: #E85D75;
  --reg-pink-bright: #ff8098;
  --reg-blue: #5f9bff;
  --reg-ink: #0f172a;
  --reg-muted: #64748b;
  --reg-border: #e2e8f0;
  --reg-surface: rgba(255,255,255,.82);
}

* {
  box-sizing: border-box;
}

.ipms-x-register {
  --mouse-x: 50%;
  --mouse-y: 50%;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 26px;
  color: var(--reg-ink);
  background:
    radial-gradient(circle at 14% 18%, rgba(232,93,117,.11), transparent 24%),
    radial-gradient(circle at 84% 17%, rgba(95,155,255,.10), transparent 26%),
    linear-gradient(180deg, #f8fafc 0%, #f2f6fb 100%);
  isolation: isolate;
}

/* =========================================================
   LIGHT AI BACKGROUND
   ========================================================= */

.ipms-x-register__spotlight {
  position: absolute;
  inset: 0;
  z-index: -5;
  pointer-events: none;
  background:
    radial-gradient(
      520px circle at var(--mouse-x) var(--mouse-y),
      rgba(232,93,117,.055),
      rgba(95,155,255,.018) 38%,
      transparent 72%
    );
}

.ipms-x-register__grid {
  position: absolute;
  inset: 0;
  z-index: -8;
  opacity: .55;
  background-image:
    linear-gradient(rgba(15,23,42,.026) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15,23,42,.026) 1px, transparent 1px);
  background-size: 52px 52px;
  mask-image: radial-gradient(ellipse at center, #000 34%, transparent 90%);
  animation: regGrid 30s linear infinite;
}

@keyframes regGrid {
  to { transform: translate3d(52px,52px,0); }
}

.ipms-x-register__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(24px);
  z-index: -6;
  pointer-events: none;
  animation: regBlob 12s ease-in-out infinite alternate;
}

.ipms-x-register__blob--1 {
  width: 470px;
  height: 470px;
  left: -150px;
  bottom: -160px;
  background: radial-gradient(circle, rgba(232,93,117,.13), transparent 68%);
}

.ipms-x-register__blob--2 {
  width: 520px;
  height: 520px;
  right: -170px;
  top: -170px;
  background: radial-gradient(circle, rgba(95,155,255,.11), transparent 68%);
  animation-delay: -3.2s;
}

@keyframes regBlob {
  from { transform: translate3d(0,0,0) scale(1); }
  to { transform: translate3d(32px,-20px,0) scale(1.07); }
}

.ipms-x-register__particles {
  position: absolute;
  inset: 0;
  z-index: -7;
  pointer-events: none;
}

.ipms-x-register__particle {
  --x: 50%;
  --y: 50%;
  --size: 3px;
  --delay: 0s;
  --duration: 7s;
  position: absolute;
  left: var(--x);
  top: var(--y);
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: rgba(95,155,255,.24);
  animation: regParticle var(--duration) ease-in-out var(--delay) infinite;
}

@keyframes regParticle {
  0%,100% { transform: translateY(0) scale(.7); opacity: .15; }
  50% { transform: translateY(-12px) scale(1.2); opacity: .75; }
}

/* =========================================================
   MAIN CONTAINER
   ========================================================= */

.ipms-x-register__shell {
  width: min(1180px, 100%);
  min-height: 690px;
  display: grid;
  grid-template-columns: .95fr 1.05fr;
  overflow: hidden;
  border: 1px solid rgba(15,23,42,.075);
  border-radius: 32px;
  background: rgba(255,255,255,.80);
  box-shadow:
    0 38px 110px rgba(15,23,42,.14),
    inset 0 1px 0 rgba(255,255,255,.85);
  backdrop-filter: blur(28px);
}

.ipms-x-register__form-side {
  position: relative;
  display: flex;
  align-items: center;
  padding: 42px 46px;
  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,.92),
      rgba(248,250,252,.84)
    );
}

.ipms-x-register__form-card {
  width: 100%;
  max-width: 480px;
}

.ipms-x-register__brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ipms-x-register__brand-icon {
  width: 45px;
  height: 45px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: var(--reg-pink);
  background: rgba(232,93,117,.075);
  border: 1px solid rgba(232,93,117,.14);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.75);
}

.ipms-x-register__brand strong {
  display: block;
  font-size: 18px;
}

.ipms-x-register__brand span {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}

.ipms-x-register__head {
  margin-top: 31px;
}

.ipms-x-register__kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--reg-pink);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.ipms-x-register__head h1 {
  margin: 10px 0 0;
  font-size: 34px;
  line-height: 1.08;
  letter-spacing: -.038em;
}

.ipms-x-register__head p {
  margin: 9px 0 0;
  color: #5f6f83;
  font-size: 13px;
  line-height: 1.6;
}

.ipms-x-register__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 15px;
  padding: 11px 12px;
  border: 1px solid #fecdd3;
  border-radius: 11px;
  background: #fff1f2;
  color: #be123c;
  font-size: 12px;
  line-height: 1.5;
}

.ipms-x-register__form {
  margin-top: 20px;
  display: grid;
  gap: 12px;
}

.ipms-x-register__grid-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.ipms-x-register__field {
  display: grid;
  gap: 6px;
}

.ipms-x-register__field--full {
  grid-column: 1 / -1;
}

.ipms-x-register__field > span {
  color: #26364a;
  font-size: 12px;
  font-weight: 760;
}

.ipms-x-register__input {
  position: relative;
}

.ipms-x-register__input-icon {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}

.ipms-x-register__input input,
.ipms-x-register__select {
  width: 100%;
  height: 44px;
  border: 1px solid #dce4ed;
  border-radius: 11px;
  outline: none;
  background: rgba(255,255,255,.92);
  color: var(--reg-ink);
  font: inherit;
  font-size: 13px;
  transition:
    border-color .18s ease,
    box-shadow .18s ease,
    transform .18s ease;
}

.ipms-x-register__input input {
  padding: 0 40px;
}

.ipms-x-register__select {
  padding: 0 12px;
}

.ipms-x-register__input input:focus,
.ipms-x-register__select:focus {
  border-color: rgba(232,93,117,.52);
  box-shadow:
    0 0 0 4px rgba(232,93,117,.07),
    0 10px 22px rgba(15,23,42,.045);
  transform: translateY(-1px);
}

.ipms-x-register__toggle {
  position: absolute;
  right: 6px;
  top: 50%;
  width: 32px;
  height: 32px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}

.ipms-x-register__toggle:hover {
  background: #f1f5f9;
  color: #475569;
}

.ipms-x-register__submit {
  position: relative;
  overflow: hidden;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 11px;
  background:
    linear-gradient(135deg, var(--reg-pink), var(--reg-pink-bright));
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
  box-shadow:
    0 14px 30px rgba(232,93,117,.19);
  transition:
    transform .18s ease,
    box-shadow .18s ease;
}

.ipms-x-register__submit::before {
  content: "";
  position: absolute;
  top: -60%;
  left: -40%;
  width: 28%;
  height: 220%;
  transform: rotate(22deg);
  background:
    linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent);
  animation: regBtn 4s ease-in-out infinite;
}

@keyframes regBtn {
  0%,60% { left: -40%; opacity: 0; }
  70% { opacity: 1; }
  96%,100% { left: 125%; opacity: 0; }
}

.ipms-x-register__submit:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 19px 38px rgba(232,93,117,.25);
}

.ipms-x-register__submit:disabled {
  opacity: .62;
  cursor: not-allowed;
}

.ipms-x-register__signin {
  margin-top: 17px;
  text-align: center;
  color: #64748b;
  font-size: 12px;
}

.ipms-x-register__signin a {
  color: var(--reg-pink);
  font-weight: 800;
  text-decoration: none;
}

/* =========================================================
   ROLE-AWARE AI VISUAL
   ========================================================= */

.ipms-x-register__visual {
  position: relative;
  overflow: hidden;
  padding: 43px;
  color: #fff;
  background:
    radial-gradient(circle at 50% 44%, rgba(232,93,117,.10), transparent 30%),
    linear-gradient(160deg, #081522 0%, #0a1a2b 68%, #0b1d30 100%);
}

.ipms-x-register__visual::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: .55;
  animation: roleGrid 22s linear infinite;
}

@keyframes roleGrid {
  to { transform: translate3d(44px,44px,0); }
}

.ipms-x-register__visual-copy {
  position: relative;
  z-index: 3;
  max-width: 500px;
}

.ipms-x-register__visual-copy span {
  color: var(--reg-pink);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.ipms-x-register__visual-copy h2 {
  margin: 11px 0 0;
  max-width: 500px;
  font-size: 38px;
  line-height: 1.04;
  letter-spacing: -.043em;
}

.ipms-x-register__visual-copy p {
  margin: 13px 0 0;
  max-width: 500px;
  color: #a3b2c5;
  font-size: 13px;
  line-height: 1.65;
}

.ipms-x-register__matrix {
  --tilt-x: 0deg;
  --tilt-y: 0deg;
  position: relative;
  height: 405px;
  margin-top: 12px;
  perspective: 1050px;
  transform-style: preserve-3d;
  transform:
    rotateX(var(--tilt-x))
    rotateY(var(--tilt-y));
  transition: transform 150ms ease-out;
}

.ipms-x-register__matrix-plane {
  position: absolute;
  left: 50%;
  top: 52%;
  width: 410px;
  height: 230px;
  transform:
    translate(-50%, -50%)
    rotateX(67deg);
  border: 1px solid rgba(95,155,255,.14);
  border-radius: 28px;
  background:
    linear-gradient(rgba(95,155,255,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(95,155,255,.05) 1px, transparent 1px),
    rgba(6,17,30,.25);
  background-size: 26px 26px;
}

.ipms-x-register__core {
  position: absolute;
  left: 50%;
  top: 51%;
  width: 112px;
  height: 112px;
  transform: translate(-50%, -50%) translateZ(48px);
  display: grid;
  place-items: center;
  border-radius: 28px;
  background:
    linear-gradient(145deg, #ff8ba1, #e85d75 58%, #a9354d);
  box-shadow:
    0 0 0 12px rgba(232,93,117,.04),
    0 0 52px rgba(232,93,117,.27);
  animation: roleCore 3s ease-in-out infinite;
  z-index: 4;
}

@keyframes roleCore {
  0%,100% {
    transform: translate(-50%,-50%) translateZ(48px) scale(1);
  }
  50% {
    transform: translate(-50%,-50%) translateZ(55px) scale(1.04);
  }
}

.ipms-x-register__core-label {
  position: absolute;
  bottom: 14px;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: .11em;
}

.ipms-x-register__orbit {
  position: absolute;
  left: 50%;
  top: 51%;
  border-radius: 50%;
  border: 1px solid rgba(232,93,117,.16);
}

.ipms-x-register__orbit--1 {
  width: 210px;
  height: 210px;
  transform: translate(-50%,-50%) rotateX(68deg);
  animation: roleOrbit1 12s linear infinite;
}

.ipms-x-register__orbit--2 {
  width: 292px;
  height: 292px;
  border-style: dashed;
  border-color: rgba(95,155,255,.13);
  transform: translate(-50%,-50%) rotateX(68deg);
  animation: roleOrbit2 18s linear infinite reverse;
}

@keyframes roleOrbit1 {
  to { transform: translate(-50%,-50%) rotateX(68deg) rotateZ(360deg); }
}

@keyframes roleOrbit2 {
  to { transform: translate(-50%,-50%) rotateX(68deg) rotateZ(360deg); }
}

.ipms-x-register__role {
  --active: 0;
  position: absolute;
  width: 142px;
  min-width: 142px;
  padding: 12px 13px;
  border-radius: 14px;
  border: 1px solid
    rgba(
      148,
      163,
      184,
      calc(.13 + var(--active) * .12)
    );
  background:
    rgba(7,19,33, calc(.84 + var(--active) * .08));
  box-shadow:
    0 18px 34px rgba(0,0,0,.22),
    0 0 calc(var(--active) * 26px)
      rgba(232,93,117,.20);
  transform: translateZ(64px)
    scale(calc(1 + var(--active) * .055));
  transition:
    border-color .22s ease,
    box-shadow .22s ease,
    transform .22s ease;
  animation: roleFloat 5.5s ease-in-out infinite;
  z-index: 5;
}

.ipms-x-register__role::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  border: 1px solid rgba(232,93,117, calc(var(--active) * .58));
  opacity: var(--active);
  animation: activePulse 1.9s ease-in-out infinite;
}

@keyframes activePulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(232,93,117,.0); }
  50% { box-shadow: 0 0 0 7px rgba(232,93,117,.045); }
}

.ipms-x-register__role strong {
  display: block;
  color: #f3f6fa;
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
}

.ipms-x-register__role span {
  display: block;
  margin-top: 5px;
  color: #91a2b7;
  font-size: 9px;
  line-height: 1.35;
  white-space: nowrap;
}

.ipms-x-register__role--engineer {
  left: 1%;
  top: 17%;
  animation-delay: -.8s;
}

.ipms-x-register__role--inventory {
  right: 1%;
  top: 17%;
  animation-delay: -2s;
}

.ipms-x-register__role--procurement {
  left: 1%;
  bottom: 16%;
  animation-delay: -3s;
}

.ipms-x-register__role--manager {
  right: 1%;
  bottom: 16%;
  animation-delay: -1.3s;
}

.ipms-x-register__role--finance {
  left: 50%;
  bottom: 0%;
  transform:
    translateX(-50%)
    translateZ(64px)
    scale(calc(1 + var(--active) * .055));
  animation-delay: -4s;
}

.ipms-x-register__role--admin {
  left: 50%;
  top: 0%;
  transform:
    translateX(-50%)
    translateZ(64px)
    scale(calc(1 + var(--active) * .055));
  animation-delay: -2.8s;
}

@keyframes roleFloat {
  0%,100% { margin-top: 0; }
  50% { margin-top: -7px; }
}

.ipms-x-register__link {
  position: absolute;
  left: 50%;
  top: 51%;
  width: 37%;
  height: 1px;
  transform-origin: left center;
  background:
    linear-gradient(90deg, rgba(232,93,117,.44), transparent);
  opacity: .65;
  z-index: 1;
}

.ipms-x-register__link--1 { transform: rotate(207deg); }
.ipms-x-register__link--2 { transform: rotate(333deg); }
.ipms-x-register__link--3 { transform: rotate(149deg); }
.ipms-x-register__link--4 { transform: rotate(27deg); }
.ipms-x-register__link--5 { transform: rotate(90deg); width: 30%; }
.ipms-x-register__link--6 { transform: rotate(270deg); width: 30%; }

.ipms-x-register__scanner {
  position: absolute;
  left: 7%;
  right: 7%;
  height: 2px;
  top: 10%;
  opacity: 0;
  background:
    linear-gradient(90deg, transparent, rgba(95,155,255,.62), transparent);
  box-shadow: 0 0 14px rgba(95,155,255,.24);
  animation: roleScan 5s ease-in-out infinite;
  z-index: 3;
}

@keyframes roleScan {
  0% { top: 10%; opacity: 0; }
  15% { opacity: .75; }
  80% { opacity: .55; }
  100% { top: 91%; opacity: 0; }
}

.ipms-x-register__role-preview {
  position: relative;
  z-index: 8;
  width: 100%;
  max-width: none;
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 13px;
  background:
    linear-gradient(
      90deg,
      rgba(232,93,117,.09),
      rgba(7,19,33,.74) 24%,
      rgba(7,19,33,.82)
    );
  box-shadow:
    inset 3px 0 0 rgba(232,93,117,.72),
    0 12px 28px rgba(0,0,0,.10);
}

.ipms-x-register__role-preview small {
  color: var(--reg-pink);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .10em;
  text-transform: uppercase;
}

.ipms-x-register__role-preview strong {
  display: block;
  margin-top: 5px;
  color: #f3f6fa;
  font-size: 13px;
}

.ipms-x-register__role-preview p {
  margin: 5px 0 0;
  color: #9aabc0;
  font-size: 10px;
  line-height: 1.5;
}

.ipms-x-register__success-backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15,23,42,.48);
  backdrop-filter: blur(5px);
}

.ipms-x-register__success {
  width: min(370px, 100%);
  padding: 28px;
  border: 1px solid var(--reg-border);
  border-radius: 20px;
  background: #fff;
  text-align: center;
  box-shadow: 0 28px 80px rgba(15,23,42,.22);
  animation: successIn .32s ease both;
}

@keyframes successIn {
  from { transform: translateY(8px) scale(.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

.ipms-x-register__success-icon {
  width: 54px;
  height: 54px;
  margin: 0 auto;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #059669;
  background: #ecfdf5;
}

.ipms-x-register__success h3 {
  margin: 14px 0 0;
  font-size: 18px;
}

.ipms-x-register__success p {
  margin: 7px 0 0;
  color: var(--reg-muted);
  font-size: 9px;
}

/* =========================================================
   RESPONSIVE
   ========================================================= */

@media (max-width: 1020px) {
  .ipms-x-register__shell {
    grid-template-columns: 1fr;
    max-width: 600px;
  }

  .ipms-x-register__visual {
    display: none;
  }

  .ipms-x-register__form-side {
    min-height: 680px;
    padding: 36px 28px;
  }
}

@media (max-width: 620px) {
  .ipms-x-register {
    padding: 13px;
  }

  .ipms-x-register__shell {
    border-radius: 23px;
  }

  .ipms-x-register__form-side {
    padding: 28px 19px;
  }

  .ipms-x-register__grid-form {
    grid-template-columns: 1fr;
  }

  .ipms-x-register__field--full {
    grid-column: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ipms-x-register *,
  .ipms-x-register *::before,
  .ipms-x-register *::after {
    animation: none !important;
    transition: none !important;
  }
}
`;


const ROLE_META = {
  admin: {
    label: "Admin",
    note: "Full platform control and system administration.",
  },
  manager: {
    label: "Manager",
    note: "Review workflows, approvals and operational oversight.",
  },
  procurement: {
    label: "Procurement",
    note: "Purchase orders, vendors, inward and procurement operations.",
  },
  inventory: {
    label: "Inventory",
    note: "Stock, component usage, outward and issue operations.",
  },
  finance: {
    label: "Finance",
    note: "Finance workflow and financial review access.",
  },
  engineer: {
    label: "Engineer",
    note: "Projects, material requests and engineering Scrap.",
  },
};


function mapRegisterRoleToAccountRole(role) {
  switch (String(role || "").trim().toLowerCase()) {
    case "admin":
      return "admin";
    case "manager":
      return "manager";
    case "procurement":
      return "procurement";
    case "inventory":
      return "inventory";
    case "engineer":
      return "engineer";
    case "finance":
      return "finance";
    default:
      return role || "inventory";
  }
}


export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");
  const [role, setRole] = useState("inventory");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] = useState("");

  const [showSuccess, setShowSuccess] =
    useState(false);

  const [pointer, setPointer] = useState({
    x: 50,
    y: 50,
    tiltX: 0,
    tiltY: 0,
  });

  const navigate = useNavigate();

  useEffect(() => {
    setFullName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setRole("inventory");
  }, []);

  const particles = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => {
        const x = (index * 41 + 7) % 96;
        const y = (index * 61 + 13) % 92;
        const size = 2 + (index % 3);
        const duration = 6 + (index % 6);
        const delay = -((index * 0.37) % 5);

        return {
          id: index,
          style: {
            "--x": `${x}%`,
            "--y": `${y}%`,
            "--size": `${size}px`,
            "--duration": `${duration}s`,
            "--delay": `${delay}s`,
          },
        };
      }),
    [],
  );

  const activeMeta =
    ROLE_META[role] ||
    ROLE_META.inventory;

  const rootStyle = {
    "--mouse-x": `${pointer.x}%`,
    "--mouse-y": `${pointer.y}%`,
  };

  const matrixStyle = {
    "--tilt-x": `${pointer.tiltX}deg`,
    "--tilt-y": `${pointer.tiltY}deg`,
  };

  const roleStyle = (name) => ({
    "--active":
      role === name ? 1 : 0,
  });

  const handlePointerMove = (event) => {
    const rect =
      event.currentTarget.getBoundingClientRect();

    const localX =
      ((event.clientX - rect.left) /
        rect.width) *
      100;

    const localY =
      ((event.clientY - rect.top) /
        rect.height) *
      100;

    setPointer({
      x: localX,
      y: localY,
      tiltX:
        -((localY - 50) / 50) *
        3.0,
      tiltY:
        ((localX - 50) / 50) *
        4.0,
    });
  };

  const handlePointerLeave = () => {
    setPointer((previous) => ({
      ...previous,
      tiltX: 0,
      tiltY: 0,
    }));
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 4) {
      setError(
        "Password must be at least 4 characters.",
      );
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${config.baseURL}/auth/register/`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            employee_name:
              fullName.trim(),
            email: email.trim(),
            password,
            role:
              mapRegisterRoleToAccountRole(
                role,
              ),
            designation: "employee",
          }),
        },
      );

      let data = null;

      try {
        data = await response.json();
      } catch (_error) {
        data = null;
      }

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            data?.email?.[0] ||
            data?.employee_name?.[0] ||
            data?.non_field_errors?.[0] ||
            "Registration failed.",
        );
      }

      setShowSuccess(true);

      window.setTimeout(() => {
        navigate("/login");
      }, 1300);
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Registration failed.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>{REGISTER_STYLES}</style>

      <main
        className="ipms-x-register"
        style={rootStyle}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
      >
        <div className="ipms-x-register__spotlight" />
        <div className="ipms-x-register__grid" />
        <div className="ipms-x-register__blob ipms-x-register__blob--1" />
        <div className="ipms-x-register__blob ipms-x-register__blob--2" />

        <div
          className="ipms-x-register__particles"
          aria-hidden="true"
        >
          {particles.map((particle) => (
            <span
              key={particle.id}
              className="ipms-x-register__particle"
              style={particle.style}
            />
          ))}
        </div>

        <section className="ipms-x-register__shell">
          <div className="ipms-x-register__form-side">
            <div className="ipms-x-register__form-card">
              <div className="ipms-x-register__brand">
                <div className="ipms-x-register__brand-icon">
                  <Boxes size={21} />
                </div>

                <div>
                  <strong>IPMS</strong>
                  <span>
                    Inventory & Procurement
                    Management System
                  </span>
                </div>
              </div>

              <div className="ipms-x-register__head">
                <span className="ipms-x-register__kicker">
                  <Sparkles size={11} />
                  Account provisioning
                </span>

                <h1>Create IPMS account</h1>

                <p>
                  Register an authorized user
                  and assign the appropriate
                  operational role.
                </p>
              </div>

              {error && (
                <div
                  className="ipms-x-register__error"
                  role="alert"
                >
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}

              <form
                onSubmit={handleRegister}
                className="ipms-x-register__form"
                autoComplete="off"
              >
                <div className="ipms-x-register__grid-form">
                  <label className="ipms-x-register__field ipms-x-register__field--full">
                    <span>Full name</span>

                    <div className="ipms-x-register__input">
                      <User
                        className="ipms-x-register__input-icon"
                        size={14}
                      />

                      <input
                        type="text"
                        value={fullName}
                        onChange={(event) =>
                          setFullName(
                            event.target.value,
                          )
                        }
                        placeholder="Enter employee name"
                        autoComplete="name"
                        required
                      />
                    </div>
                  </label>

                  <label className="ipms-x-register__field ipms-x-register__field--full">
                    <span>Email address</span>

                    <div className="ipms-x-register__input">
                      <Mail
                        className="ipms-x-register__input-icon"
                        size={14}
                      />

                      <input
                        type="email"
                        value={email}
                        onChange={(event) =>
                          setEmail(
                            event.target.value,
                          )
                        }
                        placeholder="name@company.com"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </label>

                  <label className="ipms-x-register__field">
                    <span>Password</span>

                    <div className="ipms-x-register__input">
                      <Lock
                        className="ipms-x-register__input-icon"
                        size={14}
                      />

                      <input
                        type={
                          showPassword
                            ? "text"
                            : "password"
                        }
                        value={password}
                        onChange={(event) =>
                          setPassword(
                            event.target.value,
                          )
                        }
                        placeholder="Enter password"
                        autoComplete="new-password"
                        required
                      />

                      <button
                        type="button"
                        className="ipms-x-register__toggle"
                        onClick={() =>
                          setShowPassword(
                            (value) => !value,
                          )
                        }
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </div>
                  </label>

                  <label className="ipms-x-register__field">
                    <span>Confirm password</span>

                    <div className="ipms-x-register__input">
                      <Lock
                        className="ipms-x-register__input-icon"
                        size={14}
                      />

                      <input
                        type={
                          showConfirmPassword
                            ? "text"
                            : "password"
                        }
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(
                            event.target.value,
                          )
                        }
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        required
                      />

                      <button
                        type="button"
                        className="ipms-x-register__toggle"
                        onClick={() =>
                          setShowConfirmPassword(
                            (value) => !value,
                          )
                        }
                        aria-label={
                          showConfirmPassword
                            ? "Hide confirm password"
                            : "Show confirm password"
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </div>
                  </label>

                  <label className="ipms-x-register__field ipms-x-register__field--full">
                    <span>Role</span>

                    <select
                      value={role}
                      onChange={(event) =>
                        setRole(
                          event.target.value,
                        )
                      }
                      className="ipms-x-register__select"
                      required
                    >
                      <option value="admin">
                        Admin
                      </option>

                      <option value="manager">
                        Manager
                      </option>

                      <option value="procurement">
                        Procurement
                      </option>

                      <option value="inventory">
                        Inventory
                      </option>

                      <option value="finance">
                        Finance
                      </option>

                      <option value="engineer">
                        Engineer
                      </option>
                    </select>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="ipms-x-register__submit"
                >
                  <UserPlus size={14} />

                  <span>
                    {isLoading
                      ? "Creating account..."
                      : "Create account"}
                  </span>

                  {!isLoading && (
                    <ArrowRight size={14} />
                  )}
                </button>
              </form>

              <p className="ipms-x-register__signin">
                Already have an account?{" "}
                <Link to="/login">
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          <div className="ipms-x-register__visual">
            <div className="ipms-x-register__visual-copy">
              <span>Adaptive role matrix</span>

              <h2>
                Access changes with the role
                you assign.
              </h2>

              <p>
                Select a role on the form and
                the access matrix highlights
                the active operational profile
                in real time.
              </p>
            </div>

            <div className="ipms-x-register__role-preview">
              <small>
                selected access profile
              </small>

              <strong>
                {activeMeta.label}
              </strong>

              <p>
                {activeMeta.note}
              </p>
            </div>

            <div
              className="ipms-x-register__matrix"
              style={matrixStyle}
            >
              <div className="ipms-x-register__matrix-plane" />
              <div className="ipms-x-register__scanner" />

              <div className="ipms-x-register__link ipms-x-register__link--1" />
              <div className="ipms-x-register__link ipms-x-register__link--2" />
              <div className="ipms-x-register__link ipms-x-register__link--3" />
              <div className="ipms-x-register__link ipms-x-register__link--4" />
              <div className="ipms-x-register__link ipms-x-register__link--5" />
              <div className="ipms-x-register__link ipms-x-register__link--6" />

              <div className="ipms-x-register__orbit ipms-x-register__orbit--1" />
              <div className="ipms-x-register__orbit ipms-x-register__orbit--2" />

              <div className="ipms-x-register__core">
                <Cpu size={30} />
                <span className="ipms-x-register__core-label">
                  ACCESS CORE
                </span>
              </div>

              <div
                className="ipms-x-register__role ipms-x-register__role--engineer"
                style={roleStyle("engineer")}
              >
                <strong>Engineer</strong>
                <span>Projects · MR · Scrap</span>
              </div>

              <div
                className="ipms-x-register__role ipms-x-register__role--inventory"
                style={roleStyle("inventory")}
              >
                <strong>Inventory</strong>
                <span>Stock · Issue · Outward</span>
              </div>

              <div
                className="ipms-x-register__role ipms-x-register__role--procurement"
                style={roleStyle("procurement")}
              >
                <strong>Procurement</strong>
                <span>PO · Vendor · Inward</span>
              </div>

              <div
                className="ipms-x-register__role ipms-x-register__role--manager"
                style={roleStyle("manager")}
              >
                <strong>Manager</strong>
                <span>Review · Approval</span>
              </div>

              <div
                className="ipms-x-register__role ipms-x-register__role--finance"
                style={roleStyle("finance")}
              >
                <strong>Finance</strong>
                <span>Finance workflow</span>
              </div>

              <div
                className="ipms-x-register__role ipms-x-register__role--admin"
                style={roleStyle("admin")}
              >
                <strong>Admin</strong>
                <span>Full system control</span>
              </div>

            </div>
          </div>
        </section>

        {showSuccess && (
          <div className="ipms-x-register__success-backdrop">
            <div className="ipms-x-register__success">
              <div className="ipms-x-register__success-icon">
                <ShieldCheck size={24} />
              </div>

              <h3>Account created</h3>

              <p>
                The IPMS account was created
                successfully. Redirecting to
                sign in...
              </p>
            </div>
          </div>
        )}
      </main>
    </>
  );
}