import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initializeAppData, findUser } from "../../server/db";
import { verifyPassword } from "../../server/security";
import { setAuthCookie } from "../../server/auth-cookie";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await initializeAppData();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = username ? await findUser(username) : null;

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    setAuthCookie(res, {
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
    });

    return res.status(200).json({
      authenticated: true,
      username: user.username,
      displayName: user.display_name,
    });
  } catch (error) {
    console.error("Vercel login error:", error);
    return res.status(500).json({ message: "Login service is not configured correctly" });
  }
}