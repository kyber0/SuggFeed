import { CampusVoice } from "../components/campus-voice";
export default function Page() {
  return <CampusVoice turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />;
}
