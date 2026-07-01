"use client"

import { useState } from "react"
import CryptoJS from "crypto-js"
import Logo from "@/components/Logo"

export default function Create(){

  const [name,setName] = useState("")
  const [password,setPassword] = useState("")

  const createAccount = () => {

    if(!name || !password){
      alert("Enter name and password")
      return
    }

    // Generate keys using crypto-js
    const publicKey = CryptoJS.SHA256(name + Date.now()).toString()
    const privateKey = CryptoJS.SHA256(password + Date.now()).toString()

    const user = {
      name,
      password,
      publicKey,
      privateKey
    }

    // store full object
    localStorage.setItem("user", JSON.stringify(user))

    console.log("Stored user:", user)

    alert("Account Created Successfully")

    window.location.href = "/login"
  }

  return (
    <div className="page-center">
      <div className="auth-card">
        <div className="auth-header">
          <Logo size={48} layout="horizontal" showText={true} />
          <div className="auth-header-content">
            <h2 className="auth-title">
              Create Account
            </h2>
            <p className="auth-subtitle">
              Quickly create a decentralized identity
            </p>
          </div>
        </div>

        <div className="auth-form">
          <input
            className="auth-input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="auth-input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="auth-button-row">
            <button
              onClick={() => window.location.href = "/login"}
              style={{ background: "none", border: "none", color: "var(--gold-mid)", fontWeight: "500", cursor: "pointer", fontFamily: "Raleway, sans-serif" }}
            >← Sign in</button>
            <button
              className="btn"
              onClick={createAccount}
            >Create Account</button>
          </div>
        </div>
      </div>
    </div>
  )
}
