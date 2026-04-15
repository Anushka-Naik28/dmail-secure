"use client"

import { useState } from "react"
import CryptoJS from "crypto-js"

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

  return(

    <div style={{
      maxWidth:"400px",
      margin:"auto",
      marginTop:"120px",
      padding:"30px",
      border:"1px solid #eee",
      borderRadius:"10px",
      boxShadow:"0 4px 10px rgba(0,0,0,0.1)"
    }}>

      <h2>Create Account</h2>

      <input
        placeholder="Name"
        value={name}
        onChange={(e)=>setName(e.target.value)}
        style={{width:"100%",marginTop:"20px",padding:"10px"}}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e)=>setPassword(e.target.value)}
        style={{width:"100%",marginTop:"10px",padding:"10px"}}
      />

      <button
        onClick={createAccount}
        style={{
          marginTop:"20px",
          width:"100%",
          padding:"10px",
          background:"#2563eb",
          color:"white",
          border:"none",
          borderRadius:"5px",
          cursor:"pointer"
        }}
      >
        Create Account
      </button>

    </div>
  )
}