import { Metadata } from "next";
import { ProfileDashboard } from "../../components/profile-dashboard";

export const metadata: Metadata = {
  title: "My Activity | SuggFeed",
  description: "View your submissions and supported ideas.",
};

export default function ProfilePage() {
  return <ProfileDashboard />;
}
