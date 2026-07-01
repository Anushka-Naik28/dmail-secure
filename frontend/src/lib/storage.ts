export function saveKeys(publicKey: string, privateKey: string) {

  localStorage.setItem("publicKey", publicKey);
  localStorage.setItem("privateKey", privateKey);
}
