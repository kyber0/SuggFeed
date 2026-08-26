import { SuggFeed } from "../components/sugg-feed";

export default function Page() {
  return <SuggFeed turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />;
}
