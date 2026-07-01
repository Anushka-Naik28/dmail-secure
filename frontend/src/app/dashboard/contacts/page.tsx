"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  loadContacts,
  addContact,
  deleteContact,
  fetchPublicKey,
  type Contact,
} from "@/utils/contacts"
import { copyToClipboard } from "@/utils/clipboard"
import PageHeader from "@/components/PageHeader"

let contactsCache: Contact[] | null = null
let cacheEmail = ""

export default function ContactsPage() {
  const router = useRouter()
  const [contacts, setContacts]           = useState<Contact[]>([])
  const [loading, setLoading]             = useState(true)
  const [searchQuery, setSearchQuery]     = useState("")
  const [showAddModal, setShowAddModal]   = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState<Contact | null>(null)
  const [showKeyModal, setShowKeyModal]   = useState<Contact | null>(null)
  const [showPassModal, setShowPassModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<"load"|"add"|"delete"|null>(null)
  const [passInput, setPassInput]         = useState("")
  const [passError, setPassError]         = useState("")
  const [unlocking, setUnlocking]         = useState(false)
  const [newName, setNewName]             = useState("")
  const [newEmail, setNewEmail]           = useState("")
  const [addError, setAddError]           = useState("")
  const [adding, setAdding]               = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [successMsg, setSuccessMsg]       = useState("")
  const [fetchingKey, setFetchingKey]     = useState(false)
  const [copiedKey, setCopiedKey]         = useState(false)

  // ── Auto-fetch public key when email is typed ──
  const [keyPreview, setKeyPreview]       = useState<string | null>(null)
  const [keyFetching, setKeyFetching]     = useState(false)

  const getUser = () => JSON.parse(localStorage.getItem("user") || "{}")

  useEffect(() => {
    const user = getUser()
    if (!user.email) return
    if (contactsCache && cacheEmail === user.email) {
      setContacts(contactsCache)
      setLoading(false)
      return
    }
    setShowPassModal(true)
    setPendingAction("load")
  }, [])

  // Debounced public key fetch when adding a contact
  useEffect(() => {
    if (!newEmail || !newEmail.includes("@")) {
      setKeyPreview(null)
      return
    }
    const timer = setTimeout(async () => {
      setKeyFetching(true)
      const key = await fetchPublicKey(newEmail.trim().toLowerCase())
      setKeyPreview(key)
      setKeyFetching(false)
    }, 600)
    return () => clearTimeout(timer)
  }, [newEmail])

  const handleUnlock = async () => {
    const user = getUser()
    if (passInput !== user.password) { setPassError("Incorrect password."); return }
    setUnlocking(true)
    setPassError("")
    try {
      if (pendingAction === "load") {
        loadContacts(user.email, user.privateKey, passInput, (loaded) => {
          contactsCache = loaded
          cacheEmail = user.email
          setContacts(loaded)
          setLoading(false)
          setShowPassModal(false)
          setPassInput("")
          setUnlocking(false)
        })
      } else if (pendingAction === "add") {
        setUnlocking(false)
        setShowPassModal(false)
        await handleAddContact(passInput)
        setPassInput("")
      } else if (pendingAction === "delete" && showDeleteModal) {
        setUnlocking(false)
        setShowPassModal(false)
        await handleConfirmDelete(showDeleteModal, passInput)
        setPassInput("")
      }
    } catch {
      setPassError("Failed to decrypt contacts.")
      setUnlocking(false)
    }
  }

  const handleAddContact = async (password?: string) => {
    const user = getUser()
    const pwd = password || passInput
    if (!newName.trim()) { setAddError("Name is required."); return }
    if (!newEmail.trim() || !newEmail.includes("@")) { setAddError("Valid email is required."); return }

    setAdding(true)
    setAddError("")
    try {
      const updated = await addContact(
        { name: newName.trim(), email: newEmail.trim().toLowerCase(), publicKey: keyPreview || undefined },
        user.email, user.publicKey, user.privateKey, pwd
      )
      contactsCache = updated
      setContacts(updated)
      setNewName("")
      setNewEmail("")
      setKeyPreview(null)
      setShowAddModal(false)
      setSuccessMsg("Contact added successfully!")
      setTimeout(() => setSuccessMsg(""), 3000)
    } catch {
      setAddError("Failed to save contact.")
    } finally {
      setAdding(false)
    }
  }

  const handleConfirmDelete = async (contact: Contact, password?: string) => {
    const user = getUser()
    const pwd = password || passInput
    setDeleting(true)
    try {
      const updated = await deleteContact(contact.id, user.email, user.publicKey, user.privateKey, pwd)
      contactsCache = updated
      setContacts(updated)
      setShowDeleteModal(null)
      setSuccessMsg("Contact deleted.")
      setTimeout(() => setSuccessMsg(""), 3000)
    } catch {
      setPassError("Failed to delete contact.")
    } finally {
      setDeleting(false)
    }
  }

  // ── Refresh public key for a contact ──
  const handleRefreshKey = async (contact: Contact) => {
    const user = getUser()
    setFetchingKey(true)
    const key = await fetchPublicKey(contact.email)
    if (key) {
      const updated = contacts.map((c) =>
        c.id === contact.id ? { ...c, publicKey: key } : c
      )
      contactsCache = updated
      setContacts(updated)
      // Save updated contacts
      const { saveContacts } = await import("@/utils/contacts")
      await saveContacts(updated, user.email, user.publicKey, user.privateKey)
      // Update modal view
      setShowKeyModal((prev) => prev ? { ...prev, publicKey: key } : prev)
      setSuccessMsg("Public key refreshed!")
      setTimeout(() => setSuccessMsg(""), 3000)
    }
    setFetchingKey(false)
  }

  const handleCopyKey = (key: string) => {
    copyToClipboard(key)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const handleSendMail = (contact: Contact) => {
    router.push(`/dashboard/compose?to=${encodeURIComponent(contact.email)}`)
  }

  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

  const getAvatarColor = (email: string) => {
    const colors = [
      "linear-gradient(135deg, #1a7a4a, #4caf6e)",
      "linear-gradient(135deg, #1a4a7a, #4e7abf)",
      "linear-gradient(135deg, #7a4a1a, #bf8c4e)",
      "linear-gradient(135deg, #4a1a7a, #8c4ebf)",
      "linear-gradient(135deg, #7a1a4a, #bf4e8c)",
    ]
    return colors[email.charCodeAt(0) % colors.length]
  }

  return (
    <>
      <PageHeader 
        title="Contacts"
        count={contacts.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search contacts..."
        rightElement={
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: "8px 16px",
              background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
              border: "none", borderRadius: "20px", cursor: "pointer",
              fontSize: "12px", fontWeight: "700", color: "var(--bg-body)",
              fontFamily: "Raleway, sans-serif",
            }}
          >Add Contact</button>
        }
      />

      <div style={{ padding: "0 20px" }}>
        {/* Encryption notice */}
        <div style={{
          background: "rgba(76,175,110,0.06)", border: "1px solid rgba(76,175,110,0.2)",
          borderRadius: "10px", padding: "10px 16px", marginBottom: "16px",
          marginTop: "16px",
          fontSize: "12px", color: "var(--text-muted)",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          Lock Your contacts are <strong style={{ color: "var(--text-bright)" }}>PGP encrypted</strong> and
          stored on GunDB — only you can read them. Public keys are fetched automatically from the network.
        </div>

        {successMsg && (
          <div style={{
            background: "rgba(76,175,110,0.1)", border: "1px solid rgba(76,175,110,0.3)",
            borderRadius: "8px", padding: "10px 16px", marginBottom: "14px",
            fontSize: "12px", color: "#4caf6e",
          }}>Check {successMsg}</div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px" }}>
          <div style={{
            width: "32px", height: "32px", margin: "0 auto 12px",
            border: "3px solid rgba(212, 175, 55,0.2)", borderTop: "3px solid var(--gold-mid)",
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          <p style={{ color: "var(--text-muted)" }}>Decrypting contacts...</p>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px" }}>
          <p className="empty-state">
            {searchQuery ? "No contacts found." : "No contacts yet. Add one or send a mail to auto-save contacts."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px", padding: "0 20px" }}>
          {filteredContacts.map((contact) => (
            <div key={contact.id} style={{
              background: "var(--bg-card)", border: "1px solid var(--border-gold)",
              borderRadius: "14px", padding: "18px", transition: "border 0.2s ease",
            }}>
              {/* Avatar + info */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <div style={{
                  width: "44px", height: "44px", borderRadius: "50%", flexShrink: 0,
                  background: getAvatarColor(contact.email),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "16px", fontWeight: "800", color: "#fff",
                }}>
                  {getInitials(contact.name)}
                </div>
                <div style={{ overflow: "hidden", flex: 1 }}>
                  <div style={{
                    fontSize: "14px", fontWeight: "700", color: "var(--text-bright)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{contact.name}</div>
                  <div style={{
                    fontSize: "11px", color: "var(--text-muted)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{contact.email}</div>
                </div>
              </div>

              {/* Public key badge */}
              <div style={{ marginBottom: "12px" }}>
                {contact.publicKey ? (
                  <button
                    onClick={() => setShowKeyModal(contact)}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "5px 10px", borderRadius: "8px", cursor: "pointer",
                      background: "rgba(76,175,110,0.08)",
                      border: "1px solid rgba(76,175,110,0.25)",
                      color: "#4caf6e", fontSize: "10px",
                      fontFamily: "Raleway, sans-serif", fontWeight: "600",
                      width: "100%",
                    }}
                  >
                    <span>Key</span>
                    <span style={{ flex: 1, textAlign: "left" }}>PGP Key Available</span>
                    <span style={{
                      fontFamily: "Courier New, monospace", fontSize: "9px",
                      color: "#4caf6e", opacity: 0.7,
                    }}>
                      {contact.publicKey.slice(27, 43)}...
                    </span>
                  </button>
                ) : (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "5px 10px", borderRadius: "8px",
                    background: "rgba(217,48,37,0.05)",
                    border: "1px solid rgba(217,48,37,0.15)",
                    color: "var(--text-muted)", fontSize: "10px",
                  }}>
                    <span>Warning</span>
                    <span>No PGP key found</span>
                  </div>
                )}
              </div>

              {/* Added date */}
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "12px" }}>
                Added {new Date(contact.addedAt).toLocaleDateString()}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => handleSendMail(contact)}
                  style={{
                    flex: 1, padding: "7px 0",
                    background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))",
                    border: "none", borderRadius: "8px", cursor: "pointer",
                    fontSize: "11px", fontWeight: "700", color: "var(--bg-body)",
                    fontFamily: "Raleway, sans-serif",
                  }}
                >Send Mail</button>

                <button
                  onClick={() => setShowDeleteModal(contact)}
                  style={{
                    padding: "7px 12px",
                    background: "rgba(217,48,37,0.08)",
                    border: "1px solid rgba(217,48,37,0.25)",
                    borderRadius: "8px", cursor: "pointer",
                    fontSize: "11px", color: "#e84234",
                    fontFamily: "Raleway, sans-serif",
                  }}
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Public Key modal ── */}
      {showKeyModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "480px" }}>
            <h3>PGP Public Key</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              {showKeyModal.name} · {showKeyModal.email}
            </p>

            {showKeyModal.publicKey ? (
              <>
                {/* Key fingerprint preview */}
                <div style={{
                  background: "var(--bg-panel)", border: "1px solid rgba(76,175,110,0.3)",
                  borderRadius: "8px", padding: "10px 12px", marginBottom: "12px",
                  fontFamily: "Courier New, monospace", fontSize: "9px",
                  color: "var(--gold-light)", lineHeight: "1.6",
                  maxHeight: "120px", overflowY: "auto", wordBreak: "break-all",
                }}>
                  {showKeyModal.publicKey.slice(0, 300)}...
                </div>

                {/* Key info */}
                <div style={{
                  background: "rgba(76,175,110,0.06)", border: "1px solid rgba(76,175,110,0.2)",
                  borderRadius: "8px", padding: "10px 14px", marginBottom: "16px",
                  fontSize: "11px", color: "#4caf6e",
                  display: "flex", alignItems: "center", gap: "8px",
                }}>
                  <span>Shield</span>
                  <span>RSA-2048 · OpenPGP · Verified on GunDB network</span>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => handleCopyKey(showKeyModal.publicKey!)}
                    style={{
                      padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
                      background: copiedKey ? "rgba(76,175,110,0.15)" : "rgba(212, 175, 55,0.1)",
                      border: `1px solid ${copiedKey ? "rgba(76,175,110,0.4)" : "rgba(212, 175, 55,0.3)"}`,
                      color: copiedKey ? "#4caf6e" : "var(--gold-mid)",
                      fontSize: "12px", fontFamily: "Raleway, sans-serif", fontWeight: "600",
                    }}
                  >{copiedKey ? "Check Copied!" : "Copy Key"}</button>

                  <button
                    onClick={() => handleRefreshKey(showKeyModal)}
                    disabled={fetchingKey}
                    style={{
                      padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
                      background: "none", border: "1px solid var(--border-gold)",
                      color: "var(--text-muted)", fontSize: "12px",
                      fontFamily: "Raleway, sans-serif", opacity: fetchingKey ? 0.6 : 1,
                    }}
                  >{fetchingKey ? "Refreshing..." : "Refresh Key"}</button>

                  <button
                    onClick={() => {
                      // Download as .asc file
                      const blob = new Blob([showKeyModal.publicKey!], { type: "text/plain" })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = url
                      a.download = `${showKeyModal.email}_public_key.asc`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    style={{
                      padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
                      background: "none", border: "1px solid var(--border-gold)",
                      color: "var(--text-muted)", fontSize: "12px",
                      fontFamily: "Raleway, sans-serif",
                    }}
                  >Download .asc</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
                  No public key found for this contact. They may not be registered on SecureMail.
                </p>
                <button
                  onClick={() => handleRefreshKey(showKeyModal)}
                  disabled={fetchingKey}
                  style={{
                    padding: "8px 16px", borderRadius: "8px", cursor: "pointer",
                    background: "rgba(212, 175, 55,0.1)", border: "1px solid rgba(212, 175, 55,0.3)",
                    color: "var(--gold-mid)", fontSize: "12px",
                    fontFamily: "Raleway, sans-serif", fontWeight: "600",
                  }}
                >{fetchingKey ? "Checking..." : "Check Network"}</button>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button
                className="btn-secondary"
                onClick={() => { setShowKeyModal(null); setCopiedKey(false) }}
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Password unlock modal (Standardized Vault Style) ── */}
      {showPassModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: "0", background: "transparent", border: "none" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ 
                background: "var(--bg-card)", 
                borderRadius: "20px", 
                padding: "40px", 
                border: "1px dashed var(--border-gold)",
                boxShadow: "var(--shadow-deep)"
              }}>
                <h3 style={{ color: "var(--text-bright)", marginBottom: "12px", fontSize: "20px" }}>Secure Vault</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px" }}>
                  Enter your Vault Passphrase to decrypt your contacts
                </p>
                
                {passError && (
                  <div style={{
                    padding: "10px 14px", borderRadius: "8px",
                    marginBottom: "16px", fontSize: "13px",
                    background: "rgba(217,48,37,0.1)", color: "#e84234",
                    border: "1px solid rgba(217,48,37,0.25)",
                    textAlign: "center"
                  }}>Warning {passError}</div>
                )}

                <input
                  type="password"
                  placeholder="Vault Passphrase"
                  value={passInput}
                  onChange={(e) => { setPassInput(e.target.value); setPassError("") }}
                  onKeyDown={(e) => e.key === "Enter" && !unlocking && handleUnlock()}
                  style={{ 
                    width: "100%", background: "var(--mail-row-border)", border: "1px solid #1F1F1F", 
                    borderRadius: "8px", padding: "14px 16px", color: "var(--text-bright)", 
                    fontSize: "14px", outline: "none", textAlign: "center", marginBottom: "16px" 
                  }}
                  autoFocus
                  disabled={unlocking}
                />

                <div style={{ display: "flex", gap: "12px" }}>
                  <button 
                    className="btn-secondary" 
                    onClick={() => router.push("/dashboard/inbox")} 
                    disabled={unlocking}
                    style={{ flex: 1, padding: "12px" }}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleUnlock} 
                    disabled={unlocking} 
                    style={{ 
                      flex: 1, background: "linear-gradient(135deg, var(--gold-rich), var(--gold-light))", 
                      color: "var(--bg-body)", border: "none", borderRadius: "8px", 
                      padding: "12px", fontWeight: "700", cursor: "pointer",
                      opacity: unlocking ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                    }}
                  >
                    {unlocking && (
                      <span style={{
                        display: "inline-block", width: "12px", height: "12px",
                        border: "2px solid rgba(0,0,0,0.3)", borderTop: "2px solid #000",
                        borderRadius: "50%", animation: "spin 0.8s linear infinite",
                      }} />
                    )}
                    {unlocking ? "Unlocking..." : "Unlock Vault"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add contact modal ── */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add Contact</h3>
            {addError && (
              <div style={{
                padding: "8px 12px", borderRadius: "8px",
                marginTop: "8px", marginBottom: "4px", fontSize: "13px",
                background: "rgba(217,48,37,0.1)", color: "#e84234",
                border: "1px solid rgba(217,48,37,0.25)",
              }}>Warning {addError}</div>
            )}
            <input
              type="text" className="auth-input" placeholder="Full name"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setAddError("") }}
              disabled={adding}
            />
            <input
              type="email" className="auth-input" placeholder="Email address"
              value={newEmail}
              style={{ marginTop: "10px" }}
              onChange={(e) => { setNewEmail(e.target.value); setAddError("") }}
              onKeyDown={(e) => e.key === "Enter" && !adding && handleAddContact()}
              disabled={adding}
            />

            {/* Live public key status */}
            {newEmail.includes("@") && (
              <div style={{
                marginTop: "10px", padding: "8px 12px", borderRadius: "8px",
                fontSize: "11px",
                background: keyFetching
                  ? "rgba(212, 175, 55,0.06)"
                  : keyPreview
                  ? "rgba(76,175,110,0.06)"
                  : "rgba(217,48,37,0.05)",
                border: `1px solid ${keyFetching
                  ? "rgba(212, 175, 55,0.2)"
                  : keyPreview
                  ? "rgba(76,175,110,0.25)"
                  : "rgba(217,48,37,0.15)"}`,
                color: keyFetching
                  ? "var(--gold-mid)"
                  : keyPreview ? "#4caf6e"
                  : "var(--text-muted)",
                display: "flex", alignItems: "center", gap: "6px",
              }}>
                {keyFetching && (
                  <span style={{
                    display: "inline-block", width: "10px", height: "10px",
                    border: "2px solid rgba(212, 175, 55,0.3)", borderTop: "2px solid var(--gold-mid)",
                    borderRadius: "50%", animation: "spin 0.8s linear infinite",
                  }} />
                )}
                {keyFetching && "Looking up PGP key..."}
                {!keyFetching && keyPreview && "PGP key found — will be saved automatically"}
                {!keyFetching && !keyPreview && newEmail.includes("@") && "No PGP key found — contact may not be on SecureMail"}
              </div>
            )}

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => { setShowAddModal(false); setNewName(""); setNewEmail(""); setAddError(""); setKeyPreview(null) }}
                disabled={adding}
              >Cancel</button>
              <button className="btn" onClick={() => handleAddContact()} disabled={adding} style={{ opacity: adding ? 0.7 : 1 }}>
                {adding ? "Saving..." : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete Contact</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Remove <strong style={{ color: "var(--text-bright)" }}>{showDeleteModal.name}</strong> from your contacts?
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(null)} disabled={deleting}>
                Cancel
              </button>
              <button
                onClick={() => handleConfirmDelete(showDeleteModal)}
                disabled={deleting}
                style={{
                  padding: "10px 20px", borderRadius: "8px",
                  border: "1px solid rgba(217,48,37,0.3)",
                  background: "rgba(217,48,37,0.15)", color: "#e84234",
                  cursor: "pointer", fontWeight: "700",
                  fontFamily: "Raleway, sans-serif", fontSize: "13px",
                  opacity: deleting ? 0.7 : 1,
                }}
              >{deleting ? "Deleting..." : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
