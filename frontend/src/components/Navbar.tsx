"use client";

import Link from "next/link";

export default function Navbar() {

  return (
    <div className="w-full h-14 bg-white border-b flex items-center justify-between px-6">

      <h1 className="text-xl font-bold">
        Decentralized Mail
      </h1>

      <div className="flex gap-6">

        <Link href="/login">Login</Link>

        <Link href="/signup">Signup</Link>

      </div>

    </div>
  );
}
