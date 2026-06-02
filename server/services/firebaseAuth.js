const FIREBASE_KEY  = process.env.CARDLADDER_FIREBASE_KEY;
const FIREBASE_AUTH = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`;

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res  = await fetch(FIREBASE_AUTH, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      email:             process.env.CARDLADDER_EMAIL,
      password:          process.env.CARDLADDER_PASSWORD,
      returnSecureToken: true,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Firebase Auth: ${data.error?.message ?? res.status}`);
  cachedToken = data.idToken;
  tokenExpiry = Date.now() + (Number(data.expiresIn) - 60) * 1000;
  return cachedToken;
}

module.exports = { getToken };
