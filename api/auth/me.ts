import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser } from "../../server/auth-cookie";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ authenticated: false });

  return res.status(200).json({
    authenticated: true,
    username: user.username,
    displayName: user.displayName,
  });
}