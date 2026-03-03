import { hash } from "bcryptjs";

import { db } from "../src/lib/db";

async function main() {
  const email = "demo@music.dev";

  const password = await hash("password123", 10);

  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Demo Listener",
      password,
      image:
        "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=200&q=80",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
