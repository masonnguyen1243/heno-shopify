import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export async function requireShopSession(request: Request) {
  try {
    const { admin, session } = await authenticate.admin(request);
    if (!session?.shop) throw redirect("/auth");
    return { admin, session, shop: session.shop };
  } catch (error) {
    // Re-throw Responses (OAuth redirects, re-auth redirects)
    if (error instanceof Response) throw error;
    // Any other error → redirect to auth
    throw redirect("/auth");
  }
}
