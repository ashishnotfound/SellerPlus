import { redirect } from "next/navigation";

export default function KnowledgeCenterRedirect() {
  redirect("/ai-chat?tab=knowledge");
}
