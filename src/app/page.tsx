import { redirect } from "next/navigation";

// La raíz envía al dashboard; el proxy decide si primero va a /login.
export default function Home() {
  redirect("/dashboard");
}
