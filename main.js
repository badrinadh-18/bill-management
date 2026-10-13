// ══════════════════════════════════════════════════
//  INVOICEHUB EXECUTIVE LOGIC & FIRESTORE SYNC
// ══════════════════════════════════════════════════

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

import './style.css';
// ── Firebase Config ──
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBRiiF-0-L2i1lcaunbAWuIUIrHxvNalw4",
  authDomain: "ragunadham-invoices.firebaseapp.com",
  projectId: "ragunadham-invoices",
  storageBucket: "ragunadham-invoices.firebasestorage.app",
  messagingSenderId: "621485980997",
  appId: "1:621485980997:web:e7bb4ccc609fd48e55922c"
};

if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}
const db = firebase.firestore();
const billsCol = db.collection("re_bills");
const metaDoc = db.collection("re_meta").doc("seq");
const purchaseMetaDoc = db.collection("re_meta").doc("p_seq");

// ── User credentials & roles ──
// Admin PIN handling
let adminPin = sessionStorage.getItem('adminPin') || '1234';
const USERS = { [adminPin]: 'admin', 'view': 'viewer' };
const ADMIN_ACCOUNTS_KEY = 're_admin_accounts';

function getAdminAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_ACCOUNTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveAdminAccounts(accounts) {
  localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function activeAdminAccount() {
  const email = sessionStorage.getItem('re_admin_email');
  return getAdminAccounts().find(account => account.email === email);
}

function currentAdminEmail() {
  return sessionStorage.getItem('re_admin_email') || '';
}

// ══ STATE ══
let rowCount = 0;
let pRowCount = 0;
let currentBillType = 'sale';
window.getCurrentBillType = () => currentBillType;
let editingBillId = null;
let currentViewId = null;
let deleteTargetId = null;
let currentBillData = null;
let _localBills = [];

// Initialize local cache immediately
try {
  const cached = localStorage.getItem('re_bills_cache');
  if (cached) _localBills = JSON.parse(cached);
} catch {
  _localBills = [];
}

// ══ LANDING PAGE NAVIGATION ══
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function goToSignIn() {
  const landing = document.getElementById('landingPage');
  if (landing) landing.style.display = 'none';
  const lockEl = document.getElementById('lockScreen');
  if (lockEl) lockEl.style.display = 'flex';
  showAdminLogin();
}

function goToRegister() {
  const landing = document.getElementById('landingPage');
  if (landing) landing.style.display = 'none';
  const lockEl = document.getElementById('lockScreen');
  if (lockEl) lockEl.style.display = 'flex';
  showAdminRegister();
}

function returnToLanding() {
  const lockEl = document.getElementById('lockScreen');
  if (lockEl) lockEl.style.display = 'none';
  const custEl = document.getElementById('customerPortal');
  if (custEl) custEl.style.display = 'none';
  const landing = document.getElementById('landingPage');
  if (landing) {
    landing.style.display = 'block';
    landing.scrollTop = 0;
  }
}

function submitContactForm() {
  const nameInput = document.getElementById('contactFormName');
  const emailInput = document.getElementById('contactFormEmail');
  const msgInput = document.getElementById('contactFormMessage');

  const name = nameInput?.value.trim();
  const email = emailInput?.value.trim();
  const msg = msgInput?.value.trim();

  if (!name || !email || !msg) {
    toast('Please fill out your name, email, and message.', 'error');
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    toast('Please enter a valid email address.', 'error');
    return;
  }

  try {
    const inquiry = {
      name,
      email,
      message: msg,
      createdAt: new Date().toISOString()
    };
    const inquiries = JSON.parse(localStorage.getItem('re_contact_inquiries') || '[]');
    inquiries.push(inquiry);
    localStorage.setItem('re_contact_inquiries', JSON.stringify(inquiries));
    if (typeof db !== 'undefined' && db.collection) {
      db.collection('re_contact_inquiries').add({
        ...inquiry,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(e => console.warn('Inquiry cloud backup omitted:', e));
    }
  } catch (err) {
    console.warn('Inquiry storage error:', err);
  }

  toast('Message sent successfully! We will get back to you shortly.', 'success');
  if (nameInput) nameInput.value = '';
  if (emailInput) emailInput.value = '';
  if (msgInput) msgInput.value = '';
}

// ══ LOCK SCREEN & AUTH ══
function checkAuth() {
  const isAuth = sessionStorage.getItem('re_auth') === '1';
  const landingEl = document.getElementById('landingPage');
  const lockEl = document.getElementById('lockScreen');
  const mainApp = document.getElementById('mainApp');

  if (isAuth) {
    if (landingEl) landingEl.style.display = 'none';
    if (lockEl) lockEl.style.display = 'none';
    initApp();
  } else {
    // Show landing page for prospective visitors and unauthenticated users
    if (landingEl) landingEl.style.display = 'block';
    if (lockEl) lockEl.style.display = 'none';
    if (mainApp) mainApp.style.display = 'none';
  }
}

function showLockOptions() {
  document.getElementById('lockOptions').style.display = 'block';
  document.getElementById('lockAdmin').style.display = 'none';
  document.getElementById('lockRegister').style.display = 'none';
  document.getElementById('lockRegisterPin').style.display = 'none';
  document.getElementById('lockForgotPin').style.display = 'none';
  document.getElementById('lockCustomer').style.display = 'none';
}

function showAdminLogin() {
  document.getElementById('lockOptions').style.display = 'none';
  document.getElementById('lockAdmin').style.display = 'block';
  document.getElementById('lockRegister').style.display = 'none';
  document.getElementById('lockRegisterPin').style.display = 'none';
  document.getElementById('lockForgotPin').style.display = 'none';
  document.getElementById('lockCustomer').style.display = 'none';
  const inp = document.getElementById('lockEmail');
  if (inp) inp.focus();
}

function showAdminRegister() {
  document.getElementById('lockOptions').style.display = 'none';
  document.getElementById('lockAdmin').style.display = 'none';
  document.getElementById('lockCustomer').style.display = 'none';
  document.getElementById('lockRegister').style.display = 'block';
  document.getElementById('lockRegisterPin').style.display = 'none';
  document.getElementById('lockForgotPin').style.display = 'none';
  const input = document.getElementById('registerName');
  if (input) input.focus();
}

function showForgotPin() {
  document.getElementById('lockOptions').style.display = 'none';
  document.getElementById('lockAdmin').style.display = 'none';
  document.getElementById('lockRegister').style.display = 'none';
  document.getElementById('lockRegisterPin').style.display = 'none';
  document.getElementById('lockCustomer').style.display = 'none';
  document.getElementById('lockForgotPin').style.display = 'block';
  document.getElementById('forgotEmail')?.focus();
}

function togglePinVisibility(...ids) {
  ids.forEach(id => {
    const input = document.getElementById(id);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  });
}

function resetForgottenPin() {
  const value = id => document.getElementById(id)?.value.trim() || '';
  const email = value('forgotEmail').toLowerCase();
  const phone = value('forgotPhone');
  const pin = value('forgotPin');
  const confirmPin = value('forgotConfirmPin');
  const error = document.getElementById('forgotPinError');
  const account = getAdminAccounts().find(item => item.email === email);

  if (!account || account.profile.phone !== phone) {
    if (error) error.textContent = 'The registered email and phone number do not match an account.';
    return;
  }
  if (pin.length < 4) {
    if (error) error.textContent = 'Your new PIN must contain at least 4 characters.';
    return;
  }
  if (pin !== confirmPin) {
    if (error) error.textContent = 'The PIN confirmation does not match.';
    return;
  }

  saveAdminAccounts(getAdminAccounts().map(item => item.email === email ? { ...item, pin } : item));
  if (error) error.textContent = '';
  toast('PIN reset successfully. Please log in with your new PIN.', 'success');
  showAdminLogin();
}

function showRegisterPin() {
  const value = id => document.getElementById(id)?.value.trim() || '';
  const name = value('registerName');
  const businessName = value('registerBusinessName');
  const email = value('registerEmail');
  const phone = value('registerPhone');
  const address = value('registerAddress');
  const error = document.getElementById('registerError');

  if (!name || !businessName || !email || !phone || !address) {
    if (error) error.textContent = 'Please complete every business detail before continuing.';
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    if (error) error.textContent = 'Enter a valid email address.';
    return;
  }

  if (error) error.textContent = '';
  document.getElementById('lockRegister').style.display = 'none';
  document.getElementById('lockRegisterPin').style.display = 'block';
  document.getElementById('registerPin')?.focus();
}

function showCustomerSearch() {
  document.getElementById('lockOptions').style.display = 'none';
  document.getElementById('lockCustomer').style.display = 'block';
  const inp = document.getElementById('customerNameInput');
  if (inp) inp.focus();
}

function tryUnlock() {
  const email = document.getElementById('lockEmail')?.value.trim().toLowerCase() || '';
  const pwEl = document.getElementById('lockPw');
  const pw = pwEl ? pwEl.value.trim() : '';
  const account = getAdminAccounts().find(item => item.email === email);
  if (account && account.pin === pw) {
    adminPin = account.pin;
    adminProfile = account.profile;
    sessionStorage.setItem('adminPin', adminPin);
    sessionStorage.setItem('re_admin_email', account.email);
    sessionStorage.setItem('re_auth', '1');
    sessionStorage.setItem('re_role', 'admin');
    document.getElementById('lockScreen').style.display = 'none';
    initApp();
    return;
  }

  // Compatibility login for the original PIN-only installation.
  const role = USERS[pw];
  if (role && !email) {
    // Save admin PIN if changed previously
    if (pw !== adminPin) {
      adminPin = pw;
      sessionStorage.setItem('adminPin', adminPin);
    }
    sessionStorage.setItem('re_auth', '1');
    sessionStorage.setItem('re_role', role);
    const lockEl = document.getElementById('lockScreen');
    if (lockEl) lockEl.style.display = 'none';
    initApp();
  } else {
    const errEl = document.getElementById('lockError');
    if (errEl) errEl.textContent = 'Invalid PIN. Try again.';
    if (pwEl) {
      pwEl.value = '';
      pwEl.focus();
    }
  }
}

async function registerAdmin() {
  const value = id => document.getElementById(id)?.value.trim() || '';
  const name = value('registerName');
  const businessName = value('registerBusinessName');
  const email = value('registerEmail').toLowerCase();
  const phone = value('registerPhone');
  const address = value('registerAddress');
  const pin = value('registerPin');
  const confirmPin = value('registerConfirmPin');
  const error = document.getElementById('registerPinError');

  if (!name || !businessName || !email || !phone || !address || !pin) {
    if (error) error.textContent = 'Please complete every registration field.';
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    if (error) error.textContent = 'Enter a valid email address.';
    return;
  }
  if (pin.length < 4) {
    if (error) error.textContent = 'Your PIN must contain at least 4 characters.';
    return;
  }
  if (pin !== confirmPin) {
    if (error) error.textContent = 'The PIN confirmation does not match.';
    return;
  }

  const accounts = getAdminAccounts();
  if (accounts.some(account => account.email === email)) {
    if (error) error.textContent = 'An account already exists for this email. Please log in.';
    return;
  }

  const profile = { name: businessName, adminName: name, email, phone, address };
  const account = { email, pin, profile };
  accounts.push(account);
  saveAdminAccounts(accounts);
  localStorage.setItem('admin_profile', JSON.stringify(profile));
  try {
    await db.collection('re_admin_accounts').doc(encodeURIComponent(email)).set({
      email,
      profile,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.warn('Account profile saved locally because cloud registration was unavailable.', e);
  }
  adminProfile = profile;
  adminPin = pin;
  sessionStorage.setItem('adminPin', pin);
  sessionStorage.setItem('re_admin_email', email);
  sessionStorage.setItem('re_auth', '1');
  sessionStorage.setItem('re_role', 'admin');
  document.getElementById('lockScreen').style.display = 'none';
  initApp();
}

// ---------- Admin Profile ----------
let adminProfile = { name: 'InvoiceHub', email: '', phone: '', address: '' };

function renderPaymentQr() {
  const qr = adminProfile.paymentQr || '';
  const wrap = document.getElementById('pPaymentQr');
  const image = document.getElementById('pPaymentQrImage');
  if (wrap) wrap.style.display = qr ? 'flex' : 'none';
  if (image) image.src = qr;
}

function previewPaymentQr(input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (file.size > 500 * 1024) {
    toast('Please upload a QR image smaller than 500 KB.', 'error');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const preview = document.getElementById('sQrPreview');
    if (preview) {
      preview.src = reader.result;
      preview.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}

function readPaymentQr() {
  const file = document.getElementById('sQrInput')?.files?.[0];
  if (!file) return Promise.resolve(adminProfile.paymentQr || '');
  if (file.size > 500 * 1024) return Promise.reject(new Error('Please upload a QR image smaller than 500 KB.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the QR image.'));
    reader.readAsDataURL(file);
  });
}

function businessName() {
  return adminProfile.name || 'InvoiceHub';
}

function businessContactDetails() {
  const details = [adminProfile.address, adminProfile.phone, adminProfile.email].filter(Boolean);
  return details.length ? details.join(' · ') : 'Official Commercial Tax Invoice / Bill of Supply';
}

function applyBusinessProfile() {
  const name = businessName();
  const contactDetails = businessContactDetails();
  const text = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  text('adminName', name);
  text('adminEmail', adminProfile.email || '');
  text('lockBusinessName', name);
  text('customerBusinessName', name);
  text('sidebarBusinessName', name);
  text('billBusinessName', name.toUpperCase());
  text('billBusinessDetails', contactDetails);
  renderPaymentQr();
  document.title = `${name} · Commercial Billing & Inventory Suite`;
}

async function loadAdminProfile() {
  const account = activeAdminAccount();
  if (account?.profile) {
    adminProfile = account.profile;
    applyBusinessProfile();
    return;
  }
  try {
    const doc = await db.collection('re_meta').doc('admin_profile').get();
    if (doc.exists) {
      adminProfile = doc.data();
    } else {
      // fallback to localStorage
      const stored = localStorage.getItem('admin_profile');
      adminProfile = stored ? JSON.parse(stored) : { name: 'InvoiceHub', email: '', phone: '', address: '' };
    }
  } catch (e) {
    // on error use localStorage
    const stored = localStorage.getItem('admin_profile');
    adminProfile = stored ? JSON.parse(stored) : { name: 'InvoiceHub', email: '', phone: '', address: '' };
  }
  applyBusinessProfile();
}

async function saveAdminDetails() {
  const newPin = document.getElementById('adminNewPin').value.trim();
  const newName = document.getElementById('adminNameInput').value.trim();
  const newEmail = document.getElementById('adminEmailInput').value.trim();
  // Update PIN if provided
  if (newPin) {
    delete USERS[adminPin];
    adminPin = newPin;
    USERS[adminPin] = 'admin';
    sessionStorage.setItem('adminPin', adminPin);
  }
  // Update profile
  adminProfile.name = newName || adminProfile.name;
  adminProfile.email = newEmail || adminProfile.email;
  // Persist to Firestore
  try {
    await db.collection('re_meta').doc('admin_profile').set(adminProfile, { merge: true });
  } catch (e) {
    // fallback to localStorage
    localStorage.setItem('admin_profile', JSON.stringify(adminProfile));
  }
  applyBusinessProfile();
  hideEditAdmin();
  toast('Admin details updated', 'success');
}

function showEditAdmin() {
  // The legacy edit modal was replaced by the Settings page.  Keep this
  // handler for existing buttons/links, but send them to the working editor.
  showPage('settings');
}

function hideEditAdmin() {
  // Retained for backwards compatibility with older callers.
}
function saveAdminPin() {
  const newPin = document.getElementById('adminNewPin')?.value.trim();
  if (!newPin) return;
  delete USERS[adminPin];
  adminPin = newPin;
  USERS[adminPin] = 'admin';
  sessionStorage.setItem('adminPin', adminPin);
  hideEditAdmin();
  toast('Admin PIN updated', 'success');
}

// ── Settings Page ──
function loadSettingsPage() {
  const p = adminProfile;
  const n = document.getElementById('sNameInput');
  const e = document.getElementById('sEmailInput');
  const ph = document.getElementById('sPhoneInput');
  const a = document.getElementById('sAddressInput');
  if (n) n.value = p.name || '';
  if (e) e.value = p.email || '';
  if (ph) ph.value = p.phone || '';
  if (a) a.value = p.address || '';
  const qrPreview = document.getElementById('sQrPreview');
  if (qrPreview) {
    qrPreview.src = p.paymentQr || '';
    qrPreview.style.display = p.paymentQr ? 'block' : 'none';
  }
  // Clear PIN fields
  ['sCurrentPin', 'sNewPin', 'sConfirmPin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

async function saveSettingsPage() {
  const newName = document.getElementById('sNameInput')?.value.trim();
  const newEmail = document.getElementById('sEmailInput')?.value.trim();
  const newPhone = document.getElementById('sPhoneInput')?.value.trim();
  const newAddress = document.getElementById('sAddressInput')?.value.trim();
  const currentPin = document.getElementById('sCurrentPin')?.value.trim();
  const newPin = document.getElementById('sNewPin')?.value.trim();
  const confirmPin = document.getElementById('sConfirmPin')?.value.trim();
  let paymentQr;
  try {
    paymentQr = await readPaymentQr();
  } catch (error) {
    toast(error.message, 'error');
    return;
  }

  // PIN change validation
  if (newPin || currentPin || confirmPin) {
    if (currentPin !== adminPin) {
      toast('Current PIN is incorrect.', 'error');
      return;
    }
    if (!newPin) {
      toast('Please enter a new PIN.', 'error');
      return;
    }
    if (newPin !== confirmPin) {
      toast('New PINs do not match.', 'error');
      return;
    }
    delete USERS[adminPin];
    adminPin = newPin;
    USERS[adminPin] = 'admin';
    sessionStorage.setItem('adminPin', adminPin);
  }

  // Update profile object
  adminProfile.name    = newName    || adminProfile.name;
  adminProfile.email   = newEmail   || adminProfile.email;
  adminProfile.phone   = newPhone   !== undefined ? newPhone : (adminProfile.phone || '');
  adminProfile.address = newAddress !== undefined ? newAddress : (adminProfile.address || '');
  adminProfile.paymentQr = paymentQr;

  // Persist to Firestore, fallback to localStorage
  try {
    await db.collection('re_meta').doc('admin_profile').set(adminProfile, { merge: true });
  } catch (e) {
    localStorage.setItem('admin_profile', JSON.stringify(adminProfile));
  }

  const account = activeAdminAccount();
  if (account) {
    const updatedEmail = (adminProfile.email || account.email).toLowerCase();
    const accounts = getAdminAccounts();
    if (updatedEmail !== account.email && accounts.some(item => item.email === updatedEmail)) {
      toast('Another account already uses this email address.', 'error');
      return;
    }
    saveAdminAccounts(accounts.map(item =>
      item.email === account.email ? { ...item, email: updatedEmail, pin: adminPin, profile: adminProfile } : item
    ));
    sessionStorage.setItem('re_admin_email', updatedEmail);
  }

  applyBusinessProfile();

  toast('Settings saved successfully!', 'success');
}

async function searchCustomerBills() {
  const nameEl = document.getElementById('customerNameInput');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    const err = document.getElementById('customerError');
    if (err) err.textContent = 'Please enter your name or mobile number.';
    return;
  }
  sessionStorage.setItem('re_role', 'customer');
  sessionStorage.setItem('re_name', name);
  initCustomerPortal(name);
}

function logout() {
  sessionStorage.removeItem('re_auth');
  sessionStorage.removeItem('re_role');
  sessionStorage.removeItem('re_name');
  sessionStorage.removeItem('re_admin_email');
  sessionStorage.removeItem('re_superadmin');
  sessionStorage.removeItem('adminPin');
  window.location.hash = '';
  location.reload();
}

// ══ THEME ══
function toggleTheme() {
  const root = document.documentElement;
  const currentTheme = root.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  // Update all theme toggle icons (admin, customer, lock screen, landing page)
  const icon = newTheme === 'dark' ? '☀️' : '🌙';
  ['themeToggleAdmin', 'themeToggleCustomer', 'themeToggleLock', 'themeToggleLanding'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.textContent = icon;
  });

  if (typeof renderChart === 'function') setTimeout(renderChart, 50);
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const theme = savedTheme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  const icon = theme === 'dark' ? '☀️' : '🌙';
  ['themeToggleAdmin', 'themeToggleCustomer', 'themeToggleLock'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.textContent = icon;
  });
}
initTheme();

// ══ FIRESTORE HELPERS & LOCAL CACHE ══
function localBillsCacheKey() {
  return `re_bills_cache_${currentAdminEmail() || 'legacy'}`;
}

function loadLocalBillsForCurrentAdmin() {
  try {
    const cached = localStorage.getItem(localBillsCacheKey());
    _localBills = cached ? JSON.parse(cached) : [];
  } catch {
    _localBills = [];
  }
}

function saveLocalCache() {
  try {
    localStorage.setItem(localBillsCacheKey(), JSON.stringify(_localBills));
  } catch (e) {
    console.warn('Could not update local storage cache:', e);
  }
}

async function loadAllBills() {
  showSyncIndicator(true);
  loadLocalBillsForCurrentAdmin();
  try {
    const snap = await billsCol.get();
    const ownerEmail = currentAdminEmail();
    _localBills = snap.docs
      .map(d => ({ ...d.data(), id: d.id }))
      .filter(bill => ownerEmail ? bill.ownerEmail === ownerEmail : !bill.ownerEmail);
    _localBills.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return ta - tb;
    });
    saveLocalCache();
  } catch (e) {
    console.warn('Could not load from Firestore, using offline cache:', e.message);
    toast('Using offline cache (Cloud sync pending)', 'warning');
  }
  showSyncIndicator(false);
}

function getBills() {
  return _localBills;
}

async function persistBill(bill) {
  const ownerEmail = currentAdminEmail();
  if (ownerEmail) bill.ownerEmail = ownerEmail;
  // Update local memory & cache immediately
  const idx = _localBills.findIndex(b => b.id === bill.id);
  if (idx >= 0) {
    _localBills[idx] = { ..._localBills[idx], ...bill };
  } else {
    _localBills.push(bill);
  }
  saveLocalCache();

  try {
    await billsCol.doc(bill.id).set({
      ...bill,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn('Firestore write failed, saved locally:', e.message);
  }
}

async function deleteBillFromDb(id) {
  _localBills = _localBills.filter(b => b.id !== id);
  saveLocalCache();
  try {
    await billsCol.doc(id).delete();
  } catch (e) {
    console.warn('Firestore delete failed, removed locally:', e.message);
  }
}

// ── Sequence Numbers ──
async function getNextSeq() {
  let seq = 1;
  try {
    await db.runTransaction(async tx => {
      const doc = await tx.get(metaDoc);
      seq = doc.exists ? (doc.data().seq || 0) + 1 : 1;
      tx.set(metaDoc, { seq }, { merge: true });
    });
  } catch {
    const maxExisting = _localBills
      .filter(b => b.type !== 'purchase')
      .reduce((max, b) => {
        const n = parseInt(String(b.billNo || '').replace(/\D/g, ''), 10);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
    seq = maxExisting + 1;
  }
  return seq;
}

async function peekSeq() {
  try {
    const doc = await metaDoc.get();
    return doc.exists ? (doc.data().seq || 0) + 1 : 1;
  } catch {
    const maxExisting = _localBills
      .filter(b => b.type !== 'purchase')
      .reduce((max, b) => {
        const n = parseInt(String(b.billNo || '').replace(/\D/g, ''), 10);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
    return maxExisting + 1;
  }
}

async function getNextPurchaseSeq() {
  let seq = 1;
  try {
    await db.runTransaction(async tx => {
      const doc = await tx.get(purchaseMetaDoc);
      seq = doc.exists ? (doc.data().seq || 0) + 1 : 1;
      tx.set(purchaseMetaDoc, { seq }, { merge: true });
    });
  } catch {
    const maxExisting = _localBills
      .filter(b => b.type === 'purchase')
      .reduce((max, b) => {
        const n = parseInt(String(b.billNo || '').replace(/\D/g, ''), 10);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
    seq = maxExisting + 1;
  }
  return seq;
}

async function peekPurchaseSeq() {
  try {
    const doc = await purchaseMetaDoc.get();
    return doc.exists ? (doc.data().seq || 0) + 1 : 1;
  } catch {
    const maxExisting = _localBills
      .filter(b => b.type === 'purchase')
      .reduce((max, b) => {
        const n = parseInt(String(b.billNo || '').replace(/\D/g, ''), 10);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
    return maxExisting + 1;
  }
}

async function resetSaleSeq() {
  if (!confirm('Are you sure you want to reset the sale bill sequence? The next bill will start at #0001.')) return;
  try {
    await metaDoc.set({ seq: 0 }, { merge: true });
    const seq = await peekSeq();
    const billNoEl = document.getElementById('billNo');
    if (billNoEl) billNoEl.value = fmtBillNo(seq);
    toast('Sale bill sequence reset to 1.', 'success');
  } catch (e) {
    toast('Failed to reset sequence: ' + e.message, 'error');
  }
}

async function resetPurchaseSeq() {
  if (!confirm('Are you sure you want to reset the purchase bill sequence? The next bill will start at #P0001.')) return;
  try {
    await purchaseMetaDoc.set({ seq: 0 }, { merge: true });
    const seq = await peekPurchaseSeq();
    const pBillEl = document.getElementById('pBillNoInput');
    if (pBillEl) pBillEl.value = fmtPurchaseBillNo(seq);
    toast('Purchase bill sequence reset to 1.', 'success');
  } catch (e) {
    toast('Failed to reset sequence: ' + e.message, 'error');
  }
}

function fmtBillNo(n) { return String(n).padStart(4, '0'); }
function fmtPurchaseBillNo(n) { return 'P' + String(n).padStart(4, '0'); }

// ══ SYNC INDICATOR & TOAST ══
function showSyncIndicator(show) {
  const el = document.getElementById('syncIndicator');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function toast(msg, type = '') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.innerHTML = (type === 'success' ? '✓ ' : type === 'error' ? '✗ ' : type === 'warning' ? '⚠ ' : 'ℹ ') + msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px) scale(0.95)';
    t.style.transition = 'all 0.25s ease';
    setTimeout(() => t.remove(), 250);
  }, 2800);
}

// ══ NAVIGATION ══
function showPage(id, pushState = true) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.glass-nav-item, .nav-tab').forEach(t => t.classList.remove('active'));

  const pageEl = document.getElementById(id + 'Page');
  if (pageEl) pageEl.classList.add('active');

  const tabId = id === 'purchaseForm' ? 'tab-purchaseForm' : 'tab-' + id;
  const tabEl = document.getElementById(tabId);
  if (tabEl) tabEl.classList.add('active');

  const titleMap = {
    dash: 'Executive Dashboard',
    bills: 'Commercial Invoices Directory',
    yearly: 'Fiscal Year Auditing',
    stock: 'Real-Time Stock Inventory',
    form: 'Commercial Sale Invoice',
    purchaseForm: 'Procurement & Purchase Entry',
    settings: 'Admin Settings',
    superadmin: 'Super Admin Control Center'
  };
  const titleEl = document.getElementById('pageHeaderTitle');
  if (titleEl && titleMap[id]) titleEl.textContent = titleMap[id];

  const tickerEl = document.getElementById('headerDateTicker');
  if (tickerEl) {
    const now = new Date();
    tickerEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
  }

  if (id === 'dash') refreshDash();
  if (id === 'bills') renderBillsList();
  if (id === 'yearly') renderYearly();
  if (id === 'stock') renderStock();
  if (id === 'settings') loadSettingsPage();
  if (id === 'superadmin') loadSuperadminPage();

  if (pushState) {
    window.history.pushState({ page: id }, "", "#" + id);
  }
}

window.addEventListener('popstate', function (e) {
  if (e.state && e.state.page) {
    showPage(e.state.page, false);
  } else {
    const hash = window.location.hash.substring(1);
    showPage(hash || 'dash', false);
  }
});

// ══ DASHBOARD ══
function refreshDash() {
  const bills = getBills();

  const fromEl = document.getElementById('dashFromDate');
  const toEl = document.getElementById('dashToDate');
  if (fromEl && toEl && (!fromEl.value || !toEl.value)) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    fromEl.value = `${y}-${m}-01`;
    toEl.value = `${y}-${m}-${d}`;
  }

  let mSales = 0;
  let mPurchases = 0;
  let mCount = 0;
  let pendingDues = 0;

  bills.forEach(b => {
    const inRange = (!fromEl || !toEl || !fromEl.value || !toEl.value) || (b.date >= fromEl.value && b.date <= toEl.value);
    const amt = parseFloat(b.total) || 0;
    if (inRange) {
      if (b.type === 'purchase') {
        mPurchases += amt;
      } else {
        mSales += amt;
      }
      mCount++;
    }
    // Track unpaid/pending receivables across all sales
    if (b.type !== 'purchase' && b.paymentStatus === 'pending') {
      pendingDues += amt;
    }
  });

  const salesEl = document.getElementById('statSales');
  const purchEl = document.getElementById('statPurchases');
  const profitEl = document.getElementById('statProfit');
  const duesEl = document.getElementById('statDues');

  if (salesEl) salesEl.textContent = '₹' + mSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (purchEl) purchEl.textContent = '₹' + mPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const profit = mSales - mPurchases;
  if (profitEl) {
    profitEl.textContent = '₹' + profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    profitEl.className = 'stat-value ' + (profit >= 0 ? 'green' : 'red');
  }
  if (duesEl) {
    duesEl.textContent = '₹' + pendingDues.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const dateLabel = fromEl && toEl && fromEl.value && toEl.value ? `${fromEl.value} to ${toEl.value}` : 'All Time';
  const sSub = document.getElementById('statSalesSub');
  const pSub = document.getElementById('statPurchasesSub');
  const prSub = document.getElementById('statProfitSub');
  if (sSub) sSub.textContent = `Sales (${dateLabel})`;
  if (pSub) pSub.textContent = `Purchases (${dateLabel})`;
  if (prSub) prSub.textContent = `${mCount} entries in period`;

  const badge = document.getElementById('billCountBadge');
  if (badge) badge.textContent = bills.length;

  if (typeof renderChart === 'function') setTimeout(renderChart, 0);
  checkDashboardStockAlert();

  const tbody = document.getElementById('recentBillsBody');
  const empty = document.getElementById('recentEmpty');
  if (tbody && empty) {
    const recent = [...bills].reverse().slice(0, 6);
    const countBadge = document.getElementById('dashRecentCount');
    if (countBadge) countBadge.textContent = recent.length ? `${recent.length} Invoices` : '0 Invoices';
    if (recent.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      tbody.innerHTML = recent.map(b => billRow(b, true)).join('');
    }
  }
}

// ── Dashboard Presets & Controls ──
function setDashPreset(preset) {
  const fromEl = document.getElementById('dashFromDate');
  const toEl = document.getElementById('dashToDate');
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  document.querySelectorAll('.dash-preset-btn').forEach(b => b.classList.remove('active'));

  if (preset === 'month') {
    if (fromEl) fromEl.value = `${y}-${m}-01`;
    if (toEl) toEl.value = todayStr;
    const btn = document.getElementById('presetBtnMonth');
    if (btn) btn.classList.add('active');
  } else if (preset === '30d') {
    const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const py = past.getFullYear();
    const pm = String(past.getMonth() + 1).padStart(2, '0');
    const pd = String(past.getDate()).padStart(2, '0');
    if (fromEl) fromEl.value = `${py}-${pm}-${pd}`;
    if (toEl) toEl.value = todayStr;
    const btn = document.getElementById('presetBtn30d');
    if (btn) btn.classList.add('active');
  } else if (preset === 'fy') {
    const currentMonth = now.getMonth() + 1;
    const fyStartYear = currentMonth >= 4 ? y : y - 1;
    if (fromEl) fromEl.value = `${fyStartYear}-04-01`;
    if (toEl) toEl.value = todayStr;
    const btn = document.getElementById('presetBtnFy');
    if (btn) btn.classList.add('active');
  } else if (preset === 'all') {
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    const btn = document.getElementById('presetBtnAll');
    if (btn) btn.classList.add('active');
  }
  refreshDash();
}

function setChartType(type) {
  const hiddenInput = document.getElementById('chartToggle');
  if (hiddenInput) hiddenInput.value = type;

  const btnBar = document.getElementById('btnChartBar');
  const btnLine = document.getElementById('btnChartLine');
  if (type === 'bar') {
    if (btnBar) btnBar.classList.add('active');
    if (btnLine) btnLine.classList.remove('active');
  } else {
    if (btnLine) btnLine.classList.add('active');
    if (btnBar) btnBar.classList.remove('active');
  }
  renderChart();
}

// ══ BILLS LIST & FILTERS ══
let activeListFilter = 'all';
let activePaymentFilter = 'all';

function setBillFilter(f) {
  activeListFilter = f;
  document.querySelectorAll('#billsPage .segmented-btn[data-filter]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-filter') === f);
  });
  renderBillsList();
}

function setPaymentFilter(f) {
  activePaymentFilter = f;
  renderBillsList();
}

function renderBillsList() {
  const q = (document.getElementById('searchBox')?.value || '').toLowerCase().trim();
  const fromDate = document.getElementById('listFromDate')?.value;
  const toDate = document.getElementById('listToDate')?.value;
  const sortMode = document.getElementById('listSort')?.value || 'dateDesc';
  const payFilter = document.getElementById('listPaymentStatus')?.value || activePaymentFilter;

  let filtered = getBills().filter(b => {
    if (activeListFilter === 'sale' && b.type === 'purchase') return false;
    if (activeListFilter === 'purchase' && b.type !== 'purchase') return false;
    if (fromDate && b.date < fromDate) return false;
    if (toDate && b.date > toDate) return false;

    if (payFilter && payFilter !== 'all') {
      const bStatus = b.paymentStatus || 'paid';
      if (bStatus !== payFilter) return false;
    }

    if (q) {
      const name = b.type === 'purchase' ? b.companyName : b.buyerName;
      const loc = b.type === 'purchase' ? b.address : b.village;
      const billNoStr = String(b.billNo || '');
      const amtStr = String(parseFloat(b.total) || 0);
      const itemsStr = (b.items || []).map(i => i.item).join(' ');
      const match = (name && name.toLowerCase().includes(q)) ||
        billNoStr.toLowerCase().includes(q) ||
        (loc && loc.toLowerCase().includes(q)) ||
        amtStr.includes(q) ||
        (b.date && b.date.includes(q)) ||
        itemsStr.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sortMode === 'dateDesc') {
      return (b.date || '').localeCompare(a.date || '') || (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
    }
    if (sortMode === 'dateAsc') {
      return (a.date || '').localeCompare(b.date || '') || (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0) - (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
    }
    const nameA = (a.type === 'purchase' ? a.companyName : a.buyerName) || '';
    const nameB = (b.type === 'purchase' ? b.companyName : b.buyerName) || '';
    if (sortMode === 'nameAsc') return nameA.localeCompare(nameB);
    if (sortMode === 'nameDesc') return nameB.localeCompare(nameA);
    if (sortMode === 'amountDesc') return (parseFloat(b.total) || 0) - (parseFloat(a.total) || 0);
    if (sortMode === 'amountAsc') return (parseFloat(a.total) || 0) - (parseFloat(b.total) || 0);
    return 0;
  });

  const countBadge = document.getElementById('billCountBadge');
  if (countBadge) countBadge.textContent = getBills().length;

  const tbody = document.getElementById('allBillsBody');
  const empty = document.getElementById('allBillsEmpty');
  if (tbody && empty) {
    if (filtered.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      tbody.innerHTML = filtered.map(b => billRow(b, false)).join('');
    }
  }
}

function billRow(b, compact) {
  const isPurchase = b.type === 'purchase';
  const isAdmin = getRole() === 'admin';
  const typeBadge = isPurchase
    ? `<span class="badge-pill badge-purchase">PURCHASE</span>`
    : `<span class="badge-pill badge-sale">SALE</span>`;

  const status = b.paymentStatus || 'paid';
  const statusBadge = isPurchase ? '' : `<span class="badge-pill badge-${status}">${status.toUpperCase()}</span>`;

  const name = isPurchase ? b.companyName : b.buyerName;
  const loc = isPurchase ? b.address : b.village;
  const viewFn = isPurchase ? `viewPurchase('${b.id}')` : `viewBill('${b.id}')`;
  const editFn = isPurchase ? `editPurchase('${b.id}')` : `editBill('${b.id}')`;
  const dlFn = isPurchase ? `downloadPurchaseBill('${b.id}')` : `downloadSavedBill('${b.id}')`;
  const dupFn = isPurchase ? `duplicatePurchase('${b.id}')` : `duplicateBill('${b.id}')`;

  return `<tr>
    <td>
      <span class="bill-no">#${escHtml(b.billNo || '—')}</span>
      <div style="margin-top:4px;display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
        ${typeBadge}
        ${statusBadge}
      </div>
    </td>
    <td>
      <div class="buyer-cell">${escHtml(name || '—')}</div>
    </td>
    ${!compact ? `<td><div class="village-cell">${escHtml(loc || '—')}</div></td>` : ''}
    <td style="font-size:12px;color:var(--text2);font-family:'JetBrains Mono',monospace">${escHtml(b.date || '—')}</td>
    <td>
      <span class="amount-cell" style="color: ${isPurchase ? 'var(--red)' : 'var(--green)'}">
        ₹${(parseFloat(b.total) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </td>
    <td>
      <div class="actions-cell">
        <button class="action-btn primary" onclick="${viewFn}" title="View Details">👁 View</button>
        ${isAdmin ? `<button class="action-btn" onclick="${editFn}" title="Edit Entry">✏️</button>` : ''}
        ${isAdmin ? `<button class="action-btn" onclick="${dupFn}" title="Duplicate / Clone">📋</button>` : ''}
        <button class="action-btn" onclick="${dlFn}" title="Download PDF">⬇ PDF</button>
        <button class="action-btn whatsapp" onclick="shareOnWhatsApp('${b.id}')" title="Share via WhatsApp">💬</button>
        ${isAdmin ? `<button class="action-btn danger" onclick="openDeleteModal('${b.id}')" title="Delete">🗑</button>` : ''}
      </div>
    </td>
  </tr>`;
}

// ══ FORM MANAGEMENT ══
async function resetForm(type = 'sale') {
  currentBillType = type;
  editingBillId = null;
  currentBillData = null;

  if (type === 'sale') {
    const seq = await peekSeq();
    const billNoEl = document.getElementById('billNo');
    const billDateEl = document.getElementById('billDate');
    const buyerNameEl = document.getElementById('buyerName');
    const buyerVillageEl = document.getElementById('buyerVillage');
    const payStatusEl = document.getElementById('paymentStatus');
    const payModeEl = document.getElementById('paymentMode');
    const discountEl = document.getElementById('billDiscount');

    if (billNoEl) billNoEl.value = fmtBillNo(seq);
    if (billDateEl) billDateEl.value = new Date().toISOString().split('T')[0];
    if (buyerNameEl) buyerNameEl.value = '';
    if (buyerVillageEl) buyerVillageEl.value = '';
    if (payStatusEl) payStatusEl.value = 'paid';
    if (payModeEl) payModeEl.value = 'cash';
    if (discountEl) discountEl.value = '0';

    const itemsBody = document.getElementById('itemsBody');
    if (itemsBody) itemsBody.innerHTML = '';
    rowCount = 0;
    updateGrand();
    addRow();

    const formWrap = document.getElementById('formAreaWrap');
    const billWrap = document.getElementById('billWrap');
    const saveBtn = document.getElementById('saveBillBtn');
    const savedInd = document.getElementById('savedIndicator');

    if (formWrap) formWrap.style.display = 'block';
    if (billWrap) billWrap.className = 'bill-wrap';
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '💾 Save Bill';
    }
    if (savedInd) savedInd.style.display = 'none';
  } else {
    const seq = await peekPurchaseSeq();
    const pBillNoEl = document.getElementById('pBillNoInput');
    const pBillDateEl = document.getElementById('pBillDate');
    const pCompanyEl = document.getElementById('pCompanyName');
    const pAddressEl = document.getElementById('pAddress');

    if (pBillNoEl) pBillNoEl.value = fmtPurchaseBillNo(seq);
    if (pBillDateEl) pBillDateEl.value = new Date().toISOString().split('T')[0];
    if (pCompanyEl) pCompanyEl.value = '';
    if (pAddressEl) pAddressEl.value = '';

    const pItemsBody = document.getElementById('pItemsBody');
    if (pItemsBody) pItemsBody.innerHTML = '';
    pRowCount = 0;
    updatePurchaseGrand();
    addPurchaseRow();

    const savePBtn = document.getElementById('savePurchaseBtn');
    if (savePBtn) {
      savePBtn.disabled = false;
      savePBtn.innerHTML = '💾 Save Purchase';
    }
  }
}

// ── Sale Bill Rows & Calculation ──
function addRow() {
  rowCount++;
  const tbody = document.getElementById('itemsBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.id = 'row-' + rowCount;
  tr.innerHTML = `
    <td><input type="text" placeholder="Item description" style="width:100%" /></td>
    <td><input type="number" placeholder="0" min="0" step="1" oninput="calcRow(${rowCount})" style="width:100%" /></td>
    <td>
      <select style="width:100%;height:38px;">
        <option value="kgs">kgs</option>
        <option value="pcs">pcs</option>
        <option value="bag">bag</option>
        <option value="box">box</option>
        <option value="Grams">Grams</option>
        <option value="Ltrs">Ltrs</option>
      </select>
    </td>
    <td><input type="number" placeholder="0.00" min="0" step="0.01" oninput="calcRow(${rowCount})" style="width:100%" /></td>
    <td><input type="number" id="rt${rowCount}" value="0.00" min="0" step="0.01"
        oninput="updateGrand()" style="width:100%;font-weight:700;text-align:right;font-family:'JetBrains Mono',monospace;" /></td>
    <td><button class="btnd-row" onclick="removeRow(${rowCount})" title="Remove line">×</button></td>
  `;
  tbody.appendChild(tr);
  const firstInput = tr.querySelector('input');
  if (firstInput) firstInput.focus();
}

function calcRow(id) {
  const row = document.getElementById('row-' + id);
  if (!row) return;
  const inputs = row.querySelectorAll('input');
  const qty = parseFloat(inputs[1].value) || 0;
  const price = parseFloat(inputs[2].value) || 0;
  const totalInput = document.getElementById('rt' + id);
  if (totalInput) totalInput.value = (qty * price).toFixed(2);
  updateGrand();
}

function removeRow(id) {
  const row = document.getElementById('row-' + id);
  if (row) row.remove();
  updateGrand();
}

function updateGrand() {
  let subtotal = 0;
  document.querySelectorAll('[id^="rt"]').forEach(el => {
    subtotal += parseFloat(el.value) || 0;
  });

  const discountEl = document.getElementById('billDiscount');
  const discount = discountEl ? parseFloat(discountEl.value) || 0 : 0;
  const grand = Math.max(0, subtotal - discount);

  const subtotalEl = document.getElementById('subtotalDisplay');
  if (subtotalEl) subtotalEl.textContent = '₹' + subtotal.toFixed(2);

  const grandInput = document.getElementById('grandTotal');
  const grandDisplay = document.getElementById('grandTotalDisplay');
  if (grandInput) grandInput.value = grand.toFixed(2);
  if (grandDisplay) grandDisplay.textContent = '₹' + grand.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ══ PREVIEW SALE BILL ══
async function generateBill() {
  applyBusinessProfile();
  const name = (document.getElementById('buyerName')?.value || '').trim();
  const village = (document.getElementById('buyerVillage')?.value || '').trim();
  const paymentStatus = document.getElementById('paymentStatus')?.value || 'paid';
  const paymentMode = document.getElementById('paymentMode')?.value || 'cash';
  const discount = parseFloat(document.getElementById('billDiscount')?.value) || 0;

  if (!name) {
    toast('Please enter buyer name.', 'error');
    return;
  }
  const rows = document.querySelectorAll('#itemsBody tr');
  if (!rows.length) {
    toast('Please add at least one item.', 'error');
    return;
  }

  let billNoVal;
  if (editingBillId) {
    billNoVal = document.getElementById('billNo')?.value || '';
  } else {
    const seq = await peekSeq();
    billNoVal = fmtBillNo(seq);
  }

  const date = document.getElementById('billDate')?.value || new Date().toISOString().split('T')[0];

  const pBillNo = document.getElementById('pBillNo');
  const pDate = document.getElementById('pDate');
  const pBuyerName = document.getElementById('pBuyerName');
  const pVillage = document.getElementById('pVillage');
  const pStatus = document.getElementById('pPaymentStatusDisplay');

  if (pBillNo) pBillNo.textContent = billNoVal;
  if (pDate) pDate.textContent = date;
  if (pBuyerName) pBuyerName.textContent = name;
  if (pVillage) pVillage.textContent = village;
  if (pStatus) {
    pStatus.innerHTML = `<span class="badge-pill badge-${paymentStatus}">${paymentStatus.toUpperCase()} (${paymentMode.toUpperCase()})</span>`;
  }

  let itemsArr = [], html = '', subtotal = 0;
  rows.forEach((row, i) => {
    const inputs = row.querySelectorAll('input');
    const selects = row.querySelectorAll('select');
    const item = inputs[0]?.value || '-';
    const qty = parseFloat(inputs[1]?.value) || 0;
    const type = selects[0] ? selects[0].value : '';
    const rate = parseFloat(inputs[2]?.value) || 0;
    const rtEl = row.querySelector('input[id^="rt"]');
    const amt = parseFloat(rtEl ? rtEl.value : qty * rate) || 0;
    subtotal += amt;
    itemsArr.push({ item, qty, type, rate, amt });
    html += `<tr>
      <td style="font-size:12px;padding:10px 8px;border-bottom:1px solid var(--border);color:var(--text2)">${i + 1}</td>
      <td style="font-size:13px;padding:10px 8px;border-bottom:1px solid var(--border);font-weight:600">${escHtml(item)}</td>
      <td style="font-size:13px;padding:10px 8px;border-bottom:1px solid var(--border);text-align:right;font-family:'JetBrains Mono',monospace">${qty}</td>
      <td style="font-size:12px;padding:10px 8px;border-bottom:1px solid var(--border)">${type}</td>
      <td style="font-size:13px;padding:10px 8px;border-bottom:1px solid var(--border);text-align:right;font-family:'JetBrains Mono',monospace">₹${rate.toFixed(2)}</td>
      <td style="font-size:13px;padding:10px 8px;border-bottom:1px solid var(--border);text-align:right;font-weight:700;font-family:'JetBrains Mono',monospace">₹${amt.toFixed(2)}</td>
    </tr>`;
  });

  const grand = Math.max(0, subtotal - discount);
  const pItems = document.getElementById('pItems');
  const pTotal = document.getElementById('pTotal');
  if (pItems) pItems.innerHTML = html;
  if (pTotal) pTotal.textContent = '₹' + grand.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  currentBillData = {
    id: editingBillId || ('b_' + Date.now()),
    type: 'sale',
    billNo: billNoVal,
    date,
    buyerName: name,
    village,
    paymentStatus,
    paymentMode,
    discount,
    subtotal: subtotal.toFixed(2),
    items: itemsArr,
    total: grand.toFixed(2)
  };

  const saveBtn = document.getElementById('saveBillBtn');
  const savedInd = document.getElementById('savedIndicator');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '💾 Save Bill';
  }
  if (savedInd) savedInd.style.display = 'none';

  const formWrap = document.getElementById('formAreaWrap');
  const billWrap = document.getElementById('billWrap');
  if (formWrap) formWrap.style.display = 'none';
  if (billWrap) billWrap.className = 'bill-wrap show';
}

// ══ SAVE SALE BILL ══
async function saveBill() {
  if (!currentBillData) {
    toast('No bill to save.', 'error');
    return;
  }
  const btn = document.getElementById('saveBillBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Saving...';
  }

  try {
    if (editingBillId) {
      const idx = _localBills.findIndex(b => b.id === currentBillData.id);
      if (idx >= 0) _localBills[idx] = currentBillData;
      await persistBill(currentBillData);
      toast('Bill updated successfully!', 'success');
    } else {
      const seq = await getNextSeq();
      currentBillData.billNo = fmtBillNo(seq);
      currentBillData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const pBillNo = document.getElementById('pBillNo');
      if (pBillNo) pBillNo.textContent = currentBillData.billNo;
      await persistBill(currentBillData);
      editingBillId = currentBillData.id;
      toast('Bill saved successfully! ☁️', 'success');
    }

    const badge = document.getElementById('billCountBadge');
    if (badge) badge.textContent = _localBills.length;
    if (btn) btn.innerHTML = '✓ Saved';

    const savedInd = document.getElementById('savedIndicator');
    if (savedInd) savedInd.style.display = 'block';

    if (window.refreshSuggestions) window.refreshSuggestions();
    refreshDash();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '💾 Save Bill';
    }
  }
}

function backToForm() {
  const formWrap = document.getElementById('formAreaWrap');
  const billWrap = document.getElementById('billWrap');
  if (formWrap) formWrap.style.display = 'block';
  if (billWrap) billWrap.className = 'bill-wrap';
}

// ══ EDIT & DUPLICATE SALE BILL ══
function editBill(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  closeModal('viewModal');
  showPage('form');
  editingBillId = bill.id;

  const buyerName = document.getElementById('buyerName');
  const buyerVillage = document.getElementById('buyerVillage');
  const billDate = document.getElementById('billDate');
  const billNo = document.getElementById('billNo');
  const payStatus = document.getElementById('paymentStatus');
  const payMode = document.getElementById('paymentMode');
  const discountEl = document.getElementById('billDiscount');

  if (buyerName) buyerName.value = bill.buyerName || '';
  if (buyerVillage) buyerVillage.value = bill.village || '';
  if (billDate) billDate.value = bill.date || '';
  if (billNo) billNo.value = bill.billNo || '';
  if (payStatus) payStatus.value = bill.paymentStatus || 'paid';
  if (payMode) payMode.value = bill.paymentMode || 'cash';
  if (discountEl) discountEl.value = bill.discount || '0';

  const tbody = document.getElementById('itemsBody');
  if (tbody) tbody.innerHTML = '';
  rowCount = 0;

  (bill.items || []).forEach(it => {
    rowCount++;
    const tr = document.createElement('tr');
    tr.id = 'row-' + rowCount;
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(it.item)}" style="width:100%" /></td>
      <td><input type="number" value="${it.qty}" oninput="calcRow(${rowCount})" style="width:100%" /></td>
      <td><select style="width:100%;height:38px;">
        ${['kgs', 'pcs', 'bag', 'box', 'Grams', 'Ltrs'].map(v => `<option value="${v}"${v === it.type ? ' selected' : ''}>${v}</option>`).join('')}
      </select></td>
      <td><input type="number" value="${it.rate}" oninput="calcRow(${rowCount})" style="width:100%" /></td>
      <td><input type="number" id="rt${rowCount}" value="${parseFloat(it.amt).toFixed(2)}" style="width:100%;font-weight:700;text-align:right;font-family:'JetBrains Mono',monospace" oninput="updateGrand()" /></td>
      <td><button class="btnd-row" onclick="removeRow(${rowCount})">×</button></td>
    `;
    if (tbody) tbody.appendChild(tr);
  });

  updateGrand();
  const formWrap = document.getElementById('formAreaWrap');
  const billWrap = document.getElementById('billWrap');
  if (formWrap) formWrap.style.display = 'block';
  if (billWrap) billWrap.className = 'bill-wrap';
}

async function duplicateBill(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  closeModal('viewModal');
  showPage('form');
  editingBillId = null; // New entry!

  const seq = await peekSeq();
  const buyerName = document.getElementById('buyerName');
  const buyerVillage = document.getElementById('buyerVillage');
  const billDate = document.getElementById('billDate');
  const billNo = document.getElementById('billNo');

  if (buyerName) buyerName.value = bill.buyerName || '';
  if (buyerVillage) buyerVillage.value = bill.village || '';
  if (billDate) billDate.value = new Date().toISOString().split('T')[0];
  if (billNo) billNo.value = fmtBillNo(seq);

  const tbody = document.getElementById('itemsBody');
  if (tbody) tbody.innerHTML = '';
  rowCount = 0;

  (bill.items || []).forEach(it => {
    rowCount++;
    const tr = document.createElement('tr');
    tr.id = 'row-' + rowCount;
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(it.item)}" style="width:100%" /></td>
      <td><input type="number" value="${it.qty}" oninput="calcRow(${rowCount})" style="width:100%" /></td>
      <td><select style="width:100%;height:38px;">
        ${['kgs', 'pcs', 'bag', 'box', 'Grams', 'Ltrs'].map(v => `<option value="${v}"${v === it.type ? ' selected' : ''}>${v}</option>`).join('')}
      </select></td>
      <td><input type="number" value="${it.rate}" oninput="calcRow(${rowCount})" style="width:100%" /></td>
      <td><input type="number" id="rt${rowCount}" value="${parseFloat(it.amt).toFixed(2)}" style="width:100%;font-weight:700;text-align:right;font-family:'JetBrains Mono',monospace" oninput="updateGrand()" /></td>
      <td><button class="btnd-row" onclick="removeRow(${rowCount})">×</button></td>
    `;
    if (tbody) tbody.appendChild(tr);
  });

  updateGrand();
  const formWrap = document.getElementById('formAreaWrap');
  const billWrap = document.getElementById('billWrap');
  if (formWrap) formWrap.style.display = 'block';
  if (billWrap) billWrap.className = 'bill-wrap';

  toast('Bill cloned! Review details and click Save.', 'success');
}

function clearAll() {
  if (confirm('Clear the current form?')) resetForm('sale');
}

// ══ VIEW BILL MODAL ══
function viewBill(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  currentViewId = id;

  const modalTitle = document.getElementById('viewModalTitle');
  const modalBody = document.getElementById('viewModalBody');
  if (modalTitle) modalTitle.textContent = `Invoice #${bill.billNo || '—'} · ${bill.buyerName}`;

  const status = bill.paymentStatus || 'paid';
  const mode = bill.paymentMode || 'cash';

  if (modalBody) {
    modalBody.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin-bottom:1.5rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text)">${escHtml(bill.buyerName)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">${bill.village ? escHtml(bill.village) + ' · ' : ''}${bill.date}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="badge-pill badge-${status}">${status.toUpperCase()}</span>
          <span class="badge-pill" style="background:var(--surface);border:1px solid var(--border);color:var(--text2)">${mode.toUpperCase()}</span>
        </div>
      </div>

      <table class="itable" style="width:100%;margin-bottom:1rem">
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Item</th>
            <th style="text-align:right">Qty</th>
            <th>Unit</th>
            <th style="text-align:right">Rate</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${(bill.items || []).map((it, i) => `<tr>
            <td style="color:var(--text3);font-size:12px">${i + 1}</td>
            <td style="font-weight:600">${escHtml(it.item)}</td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace">${it.qty}</td>
            <td>${it.type}</td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace">₹${parseFloat(it.rate).toFixed(2)}</td>
            <td style="text-align:right;font-weight:700;font-family:'JetBrains Mono',monospace">₹${parseFloat(it.amt).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      ${bill.discount && parseFloat(bill.discount) > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text2);padding:4px 8px">
        <span>Discount</span>
        <span>- ₹${parseFloat(bill.discount).toFixed(2)}</span>
      </div>` : ''}

      <div style="border-top:2px solid var(--border);padding:12px 8px 4px;display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:14px;font-weight:700;text-transform:uppercase;color:var(--text2)">Grand Total</span>
        <span style="font-size:22px;font-weight:800;color:var(--blue);font-family:'JetBrains Mono',monospace">₹${(parseFloat(bill.total) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    `;
  }

  const dlBtn = document.getElementById('modalDownloadBtn');
  if (dlBtn) dlBtn.style.display = 'inline-flex';
  openModal('viewModal');
}

// ══ DELETE BILL ══
function openDeleteModal(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  deleteTargetId = id;
  const noText = document.getElementById('deleteBillNoText');
  if (noText) noText.textContent = '#' + (bill.billNo || '—');
  openModal('deleteModal');
}

async function confirmDelete() {
  const btn = document.querySelector('#deleteModal .btn[onclick="confirmDelete()"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Deleting...';
  }
  try {
    await deleteBillFromDb(deleteTargetId);
    closeModal('deleteModal');
    toast('Bill deleted.', '');
    renderBillsList();
    refreshDash();
  } catch (e) {
    toast('Delete failed: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Delete';
    }
  }
}

// ══ PRINT & PDF ══
function printSavedBill(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  renderBillIntoPreview(bill);
  closeModal('viewModal');
  setTimeout(() => window.print(), 350);
}

async function downloadSavedBill(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  closeModal('viewModal');
  await generatePdfForBill(bill);
}

function renderBillIntoPreview(bill) {
  applyBusinessProfile();
  showPage('form');
  editingBillId = bill.id;
  const buyerName = document.getElementById('buyerName');
  const buyerVillage = document.getElementById('buyerVillage');
  const billDate = document.getElementById('billDate');
  const billNo = document.getElementById('billNo');

  if (buyerName) buyerName.value = bill.buyerName || '';
  if (buyerVillage) buyerVillage.value = bill.village || '';
  if (billDate) billDate.value = bill.date || '';
  if (billNo) billNo.value = bill.billNo || '';

  const tbody = document.getElementById('itemsBody');
  if (tbody) tbody.innerHTML = '';
  rowCount = 0;

  (bill.items || []).forEach(it => {
    rowCount++;
    const tr = document.createElement('tr');
    tr.id = 'row-' + rowCount;
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(it.item)}" style="width:100%" /></td>
      <td><input type="number" value="${it.qty}" oninput="calcRow(${rowCount})" style="width:100%" /></td>
      <td><select style="width:100%;height:38px;">
        ${['kgs', 'pcs', 'bag', 'box', 'Grams', 'Ltrs'].map(v => `<option value="${v}"${v === it.type ? ' selected' : ''}>${v}</option>`).join('')}
      </select></td>
      <td><input type="number" value="${it.rate}" oninput="calcRow(${rowCount})" style="width:100%" /></td>
      <td><input type="number" id="rt${rowCount}" value="${parseFloat(it.amt).toFixed(2)}" style="width:100%;font-weight:700;text-align:right;font-family:'JetBrains Mono',monospace" oninput="updateGrand()" /></td>
      <td><button class="btnd-row" onclick="removeRow(${rowCount})">×</button></td>
    `;
    if (tbody) tbody.appendChild(tr);
  });

  updateGrand();
  const formWrap = document.getElementById('formAreaWrap');
  const billWrap = document.getElementById('billWrap');
  if (formWrap) formWrap.style.display = 'block';
  if (billWrap) billWrap.className = 'bill-wrap';
}

async function downloadBill() {
  if (!currentBillData) {
    toast('Generate bill preview first.', 'error');
    return;
  }
  saveBill();
  await generatePdfForBill(currentBillData);
}

async function generatePdfForBill(bill) {
  const cleanName = (bill.buyerName + '_' + (bill.billNo || '0000')).replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
  const fname = cleanName + '.pdf';
  const btn = document.getElementById('downloadBtn') || document.getElementById('modalDownloadBtn');
  if (btn) {
    btn.innerHTML = '⏳ Generating...';
    btn.disabled = true;
  }

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
    const W = 148, ml = 10, mr = 10, cw = W - ml - mr;
    const BLUE = [30, 64, 175], GRAY = [100, 116, 139], DARK = [15, 23, 42], LIGHTBG = [248, 250, 252];
    let y = 10;

    const txt = (s, x, yy, opts) => pdf.text(String(s ?? ''), x, yy, opts);
    const setFont = (style, size, color) => {
      pdf.setFont('helvetica', style || 'normal');
      pdf.setFontSize(size || 10);
      pdf.setTextColor(...(color || DARK));
    };

    // Header Band
    pdf.setFillColor(...LIGHTBG);
    pdf.rect(0, 0, W, 34, 'F');
    pdf.setFillColor(...BLUE);
    pdf.rect(0, 0, W, 3, 'F');

    const companyName = businessName();
    const companyDetails = businessContactDetails();

    // Title
    setFont('bold', 15, BLUE);
    txt(companyName.toUpperCase(), ml, y + 6);
    setFont('normal', 7.5, GRAY);
    txt(companyDetails, ml, y + 11);
    txt('Tax Invoice / Bill of Supply', ml, y + 15);

    // Bill Meta Box
    setFont('bold', 11, DARK);
    txt('INVOICE #' + (bill.billNo || '—'), W - mr, y + 6, { align: 'right' });
    setFont('normal', 8, GRAY);
    txt('Date: ' + (bill.date || '—'), W - mr, y + 11, { align: 'right' });

    y = 38;

    // Buyer Information
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(...LIGHTBG);
    pdf.roundedRect(ml, y, cw, 16, 2, 2, 'FD');

    setFont('bold', 8, GRAY);
    txt('BILLED TO:', ml + 4, y + 5);
    setFont('bold', 9.5, DARK);
    txt(bill.buyerName || '—', ml + 4, y + 10);
    if (bill.village) {
      setFont('normal', 8, GRAY);
      txt(bill.village, ml + 4, y + 14);
    }

    y += 20;

    // Table Header
    const cols = [
      { name: '#', x: ml + 2, w: 7, align: 'left' },
      { name: 'ITEM DESCRIPTION', x: ml + 10, w: 56, align: 'left' },
      { name: 'QTY', x: ml + 68, w: 16, align: 'right' },
      { name: 'RATE (₹)', x: ml + 88, w: 18, align: 'right' },
      { name: 'AMOUNT (₹)', x: W - mr - 2, w: 22, align: 'right' }
    ];

    pdf.setFillColor(...BLUE);
    pdf.rect(ml, y, cw, 6.5, 'F');
    setFont('bold', 7, [255, 255, 255]);
    cols.forEach(c => txt(c.name, c.x, y + 4.5, { align: c.align }));
    y += 6.5;

    // Items
    (bill.items || []).forEach((it, i) => {
      const rowH = 6;
      if (i % 2 === 1) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(ml, y, cw, rowH, 'F');
      }
      setFont('normal', 7.5, GRAY);
      txt(String(i + 1), cols[0].x, y + 4.2);
      setFont('bold', 8, DARK);
      txt(it.item || '-', cols[1].x, y + 4.2);
      setFont('normal', 8, DARK);
      txt(`${it.qty} ${it.type || ''}`, cols[2].x, y + 4.2, { align: 'right' });
      txt(parseFloat(it.rate).toFixed(2), cols[3].x, y + 4.2, { align: 'right' });
      setFont('bold', 8, DARK);
      txt(parseFloat(it.amt).toFixed(2), cols[4].x, y + 4.2, { align: 'right' });

      pdf.setDrawColor(241, 245, 249);
      pdf.line(ml, y + rowH, W - mr, y + rowH);
      y += rowH;
    });

    y += 4;

    // Grand Total Box
    pdf.setFillColor(...LIGHTBG);
    pdf.roundedRect(W - mr - 55, y, 55, 12, 2, 2, 'FD');
    setFont('bold', 8, GRAY);
    txt('TOTAL AMOUNT:', W - mr - 51, y + 5);
    setFont('bold', 12, BLUE);
    txt('₹' + parseFloat(bill.total).toFixed(2), W - mr - 4, y + 8.5, { align: 'right' });

    y += 18;

    // Payment QR replaces the previous signature section.
    if (adminProfile.paymentQr) {
      try {
        pdf.addImage(adminProfile.paymentQr, 'PNG', W - mr - 25, y - 5, 25, 25);
        setFont('bold', 7.5, GRAY);
        txt('SCAN TO PAY', W - mr - 12.5, y + 23, { align: 'center' });
      } catch (e) {
        console.warn('Could not add payment QR to PDF:', e);
      }
    }
    setFont('italic', 7.5, GRAY);
    txt('Thank you for your valued business!', ml, y + 8);

    pdf.save(fname);
    toast('PDF downloaded successfully!', 'success');
  } catch (err) {
    console.error(err);
    toast('PDF generation failed: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = btn.id === 'downloadBtn' ? '⬇ Download PDF' : '⬇ PDF';
      btn.disabled = false;
    }
  }
}

// ══ PURCHASE FORM LOGIC ══
function addPurchaseRow() {
  pRowCount++;
  const tbody = document.getElementById('pItemsBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.id = 'prow-' + pRowCount;
  tr.innerHTML = `
    <td><input type="text" placeholder="Item name" style="width:100%" /></td>
    <td><input type="number" placeholder="0" min="0" step="1" oninput="calcPurchaseRow(${pRowCount})" style="width:100%" /></td>
    <td>
      <select style="width:100%;height:38px;">
        <option value="kgs">kgs</option>
        <option value="pcs">pcs</option>
        <option value="bag">bag</option>
        <option value="box">box</option>
        <option value="Grams">Grams</option>
        <option value="Ltrs">Ltrs</option>
      </select>
    </td>
    <td><input type="number" placeholder="0.00" min="0" step="0.01" oninput="calcPurchaseRow(${pRowCount})" style="width:100%" /></td>
    <td>
      <select onchange="calcPurchaseRow(${pRowCount})" style="width:100%;height:38px;">
        <option value="0">0%</option>
        <option value="5">5%</option>
        <option value="12">12%</option>
        <option value="18">18%</option>
      </select>
    </td>
    <td><input type="number" id="prt${pRowCount}" value="0.00" min="0" step="0.01"
        readonly style="width:100%;font-weight:700;text-align:right;background:var(--surface2);font-family:'JetBrains Mono',monospace;" /></td>
    <td><button class="btnd-row" onclick="removePurchaseRow(${pRowCount})">×</button></td>
  `;
  tbody.appendChild(tr);
  const firstInput = tr.querySelector('input');
  if (firstInput) firstInput.focus();
}

function calcPurchaseRow(id) {
  const row = document.getElementById('prow-' + id);
  if (!row) return;
  const inputs = row.querySelectorAll('input');
  const selects = row.querySelectorAll('select');
  const qty = parseFloat(inputs[1].value) || 0;
  const price = parseFloat(inputs[2].value) || 0;
  const taxRate = parseFloat(selects[1].value) || 0;

  const base = qty * price;
  const tax = base * (taxRate / 100);
  const total = base + tax;

  const out = document.getElementById('prt' + id);
  if (out) out.value = total.toFixed(2);
  updatePurchaseGrand();
}

function removePurchaseRow(id) {
  const row = document.getElementById('prow-' + id);
  if (row) row.remove();
  updatePurchaseGrand();
}

function updatePurchaseGrand() {
  let g = 0;
  document.querySelectorAll('[id^="prt"]').forEach(el => {
    g += parseFloat(el.value) || 0;
  });
  const grandInput = document.getElementById('pGrandTotal');
  const grandDisplay = document.getElementById('pGrandTotalDisplay');
  if (grandInput) grandInput.value = g.toFixed(2);
  if (grandDisplay) grandDisplay.textContent = '₹' + g.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clearPurchaseAll() {
  if (confirm('Clear the purchase form?')) resetForm('purchase');
}

async function savePurchaseBill() {
  const name = (document.getElementById('pCompanyName')?.value || '').trim();
  const address = (document.getElementById('pAddress')?.value || '').trim();
  const date = document.getElementById('pBillDate')?.value || new Date().toISOString().split('T')[0];
  if (!name) {
    toast('Please enter company name.', 'error');
    return;
  }

  const rows = document.querySelectorAll('#pItemsBody tr');
  if (!rows.length) {
    toast('Please add at least one item.', 'error');
    return;
  }

  let billNoVal;
  if (editingBillId) {
    billNoVal = document.getElementById('pBillNoInput')?.value || '';
  }

  let itemsArr = [], grand = 0;
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const selects = row.querySelectorAll('select');
    const item = inputs[0]?.value || '-';
    const qty = parseFloat(inputs[1]?.value) || 0;
    const type = selects[0] ? selects[0].value : '';
    const rate = parseFloat(inputs[2]?.value) || 0;
    const taxRate = parseFloat(selects[1]?.value) || 0;
    const amt = parseFloat(row.querySelector('input[id^="prt"]')?.value) || 0;
    grand += amt;
    itemsArr.push({ item, qty, type, rate, taxRate, amt });
  });

  const billData = {
    id: editingBillId || ('p_' + Date.now()),
    type: 'purchase',
    billNo: billNoVal,
    date,
    companyName: name,
    address,
    items: itemsArr,
    total: grand.toFixed(2)
  };

  const btn = document.getElementById('savePurchaseBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Saving...';
  }

  try {
    if (editingBillId) {
      const idx = _localBills.findIndex(b => b.id === billData.id);
      if (idx >= 0) _localBills[idx] = billData;
      await persistBill(billData);
      toast('Purchase updated!', 'success');
    } else {
      const seq = await getNextPurchaseSeq();
      billData.billNo = fmtPurchaseBillNo(seq);
      billData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await persistBill(billData);
      editingBillId = billData.id;
      const pBillInput = document.getElementById('pBillNoInput');
      if (pBillInput) pBillInput.value = billData.billNo;
      toast('Purchase saved to cloud!', 'success');
    }
    const badge = document.getElementById('billCountBadge');
    if (badge) badge.textContent = _localBills.length;
    if (btn) btn.innerHTML = '✓ Saved';
    refreshDash();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '💾 Save Purchase';
    }
  }
}

function editPurchase(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  closeModal('viewModal');
  showPage('purchaseForm');
  editingBillId = bill.id;

  const pBillNo = document.getElementById('pBillNoInput');
  const pCompany = document.getElementById('pCompanyName');
  const pAddress = document.getElementById('pAddress');
  const pDate = document.getElementById('pBillDate');

  if (pBillNo) pBillNo.value = bill.billNo || '—';
  if (pCompany) pCompany.value = bill.companyName || '';
  if (pAddress) pAddress.value = bill.address || '';
  if (pDate) pDate.value = bill.date || '';

  const tbody = document.getElementById('pItemsBody');
  if (tbody) tbody.innerHTML = '';
  pRowCount = 0;

  (bill.items || []).forEach(it => {
    pRowCount++;
    const tr = document.createElement('tr');
    tr.id = 'prow-' + pRowCount;
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(it.item)}" style="width:100%" /></td>
      <td><input type="number" value="${it.qty}" oninput="calcPurchaseRow(${pRowCount})" style="width:100%" /></td>
      <td><select style="width:100%;height:38px;">
        ${['kgs', 'pcs', 'bag', 'box', 'Grams', 'Ltrs'].map(v => `<option value="${v}"${v === it.type ? ' selected' : ''}>${v}</option>`).join('')}
      </select></td>
      <td><input type="number" value="${it.rate}" oninput="calcPurchaseRow(${pRowCount})" style="width:100%" /></td>
      <td><select onchange="calcPurchaseRow(${pRowCount})" style="width:100%;height:38px;">
        ${[0, 5, 12, 18].map(v => `<option value="${v}"${v === (it.taxRate || 0) ? ' selected' : ''}>${v}%</option>`).join('')}
      </select></td>
      <td><input type="number" id="prt${pRowCount}" value="${parseFloat(it.amt).toFixed(2)}" readonly style="width:100%;font-weight:700;text-align:right;background:var(--surface2);font-family:'JetBrains Mono',monospace;" /></td>
      <td><button class="btnd-row" onclick="removePurchaseRow(${pRowCount})">×</button></td>
    `;
    if (tbody) tbody.appendChild(tr);
  });

  updatePurchaseGrand();
  const savePBtn = document.getElementById('savePurchaseBtn');
  if (savePBtn) {
    savePBtn.disabled = false;
    savePBtn.innerHTML = '💾 Save Purchase';
  }
}

async function duplicatePurchase(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  closeModal('viewModal');
  showPage('purchaseForm');
  editingBillId = null;

  const seq = await peekPurchaseSeq();
  const pBillNo = document.getElementById('pBillNoInput');
  const pCompany = document.getElementById('pCompanyName');
  const pAddress = document.getElementById('pAddress');
  const pDate = document.getElementById('pBillDate');

  if (pBillNo) pBillNo.value = fmtPurchaseBillNo(seq);
  if (pCompany) pCompany.value = bill.companyName || '';
  if (pAddress) pAddress.value = bill.address || '';
  if (pDate) pDate.value = new Date().toISOString().split('T')[0];

  const tbody = document.getElementById('pItemsBody');
  if (tbody) tbody.innerHTML = '';
  pRowCount = 0;

  (bill.items || []).forEach(it => {
    pRowCount++;
    const tr = document.createElement('tr');
    tr.id = 'prow-' + pRowCount;
    tr.innerHTML = `
      <td><input type="text" value="${escAttr(it.item)}" style="width:100%" /></td>
      <td><input type="number" value="${it.qty}" oninput="calcPurchaseRow(${pRowCount})" style="width:100%" /></td>
      <td><select style="width:100%;height:38px;">
        ${['kgs', 'pcs', 'bag', 'box', 'Grams', 'Ltrs'].map(v => `<option value="${v}"${v === it.type ? ' selected' : ''}>${v}</option>`).join('')}
      </select></td>
      <td><input type="number" value="${it.rate}" oninput="calcPurchaseRow(${pRowCount})" style="width:100%" /></td>
      <td><select onchange="calcPurchaseRow(${pRowCount})" style="width:100%;height:38px;">
        ${[0, 5, 12, 18].map(v => `<option value="${v}"${v === (it.taxRate || 0) ? ' selected' : ''}>${v}%</option>`).join('')}
      </select></td>
      <td><input type="number" id="prt${pRowCount}" value="${parseFloat(it.amt).toFixed(2)}" readonly style="width:100%;font-weight:700;text-align:right;background:var(--surface2);font-family:'JetBrains Mono',monospace;" /></td>
      <td><button class="btnd-row" onclick="removePurchaseRow(${pRowCount})">×</button></td>
    `;
    if (tbody) tbody.appendChild(tr);
  });

  updatePurchaseGrand();
  toast('Purchase duplicated! Review & Save.', 'success');
}

function viewPurchase(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  currentViewId = id;

  const modalTitle = document.getElementById('viewModalTitle');
  const modalBody = document.getElementById('viewModalBody');
  if (modalTitle) modalTitle.textContent = `Purchase · ${bill.companyName}`;

  if (modalBody) {
    modalBody.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin-bottom:1.5rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text)">${escHtml(bill.companyName)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">${bill.address ? escHtml(bill.address) + ' · ' : ''}${bill.date}</div>
        </div>
        <span class="badge-pill badge-purchase">PURCHASE VOUCHER</span>
      </div>

      <table class="itable" style="width:100%;margin-bottom:1rem">
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Item</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Rate</th>
            <th style="text-align:right">Tax</th>
            <th style="text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(bill.items || []).map((it, i) => `<tr>
            <td style="color:var(--text3);font-size:12px">${i + 1}</td>
            <td style="font-weight:600">${escHtml(it.item)}</td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace">${it.qty} ${it.type || ''}</td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace">₹${parseFloat(it.rate).toFixed(2)}</td>
            <td style="text-align:right;font-family:'JetBrains Mono',monospace">${it.taxRate || 0}%</td>
            <td style="text-align:right;font-weight:700;font-family:'JetBrains Mono',monospace">₹${parseFloat(it.amt).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div style="border-top:2px solid var(--border);padding:12px 8px 4px;display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:14px;font-weight:700;text-transform:uppercase;color:var(--text2)">Total Incurred</span>
        <span style="font-size:22px;font-weight:800;color:var(--red);font-family:'JetBrains Mono',monospace">₹${(parseFloat(bill.total) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    `;
  }

  const dlBtn = document.getElementById('modalDownloadBtn');
  if (dlBtn) dlBtn.style.display = 'inline-flex';
  openModal('viewModal');
}

async function generatePurchasePdf(bill) {
  const cleanName = ('Purchase_' + (bill.companyName || 'Vendor') + '_' + (bill.date || 'Record')).replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
  const fname = cleanName + '.pdf';
  const btn = document.getElementById('modalDownloadBtn');
  if (btn) {
    btn.innerHTML = '⏳ Generating...';
    btn.disabled = true;
  }
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
    const W = 148, ml = 10, mr = 10, cw = W - ml - mr;
    const GRAY = [100, 116, 139], DARK = [15, 23, 42], LIGHTBG = [248, 250, 252], ORANGE = [217, 119, 6];
    let y = 10;

    const txt = (s, x, yy, opts) => pdf.text(String(s ?? ''), x, yy, opts);
    const setFont = (style, size, color) => {
      pdf.setFont('helvetica', style || 'normal');
      pdf.setFontSize(size || 10);
      pdf.setTextColor(...(color || DARK));
    };

    pdf.setFillColor(...LIGHTBG);
    pdf.rect(0, 0, W, 30, 'F');
    pdf.setFillColor(...ORANGE);
    pdf.rect(0, 0, W, 3, 'F');

    const companyName = businessName();
    setFont('bold', 14, ORANGE);
    txt('PURCHASE RECORD', ml, y + 6);
    setFont('normal', 8, GRAY);
    txt(companyName + ' · Internal Accounting', ml, y + 11);

    setFont('bold', 10, DARK);
    txt('P.BILL #' + (bill.billNo || '—'), W - mr, y + 6, { align: 'right' });
    setFont('normal', 8, GRAY);
    txt('Date: ' + (bill.date || '—'), W - mr, y + 11, { align: 'right' });

    y = 35;
    pdf.setFillColor(...LIGHTBG);
    pdf.roundedRect(ml, y, cw, 14, 2, 2, 'FD');
    setFont('bold', 8, GRAY);
    txt('VENDOR / COMPANY:', ml + 4, y + 5);
    setFont('bold', 9.5, DARK);
    txt(bill.companyName || '—', ml + 4, y + 10);

    y += 18;
    pdf.setFillColor(...ORANGE);
    pdf.rect(ml, y, cw, 6.5, 'F');
    setFont('bold', 7, [255, 255, 255]);
    txt('#', ml + 2, y + 4.5);
    txt('ITEM', ml + 10, y + 4.5);
    txt('QTY', ml + 68, y + 4.5, { align: 'right' });
    txt('RATE', ml + 88, y + 4.5, { align: 'right' });
    txt('TAX', ml + 104, y + 4.5, { align: 'right' });
    txt('TOTAL', W - mr - 2, y + 4.5, { align: 'right' });
    y += 6.5;

    (bill.items || []).forEach((it, i) => {
      const rowH = 6;
      setFont('normal', 7.5, DARK);
      txt(String(i + 1), ml + 2, y + 4.2);
      txt(it.item || '-', ml + 10, y + 4.2);
      txt(`${it.qty} ${it.type || ''}`, ml + 68, y + 4.2, { align: 'right' });
      txt(parseFloat(it.rate).toFixed(2), ml + 88, y + 4.2, { align: 'right' });
      txt((it.taxRate || 0) + '%', ml + 104, y + 4.2, { align: 'right' });
      setFont('bold', 7.5, DARK);
      txt(parseFloat(it.amt).toFixed(2), W - mr - 2, y + 4.2, { align: 'right' });
      pdf.setDrawColor(241, 245, 249);
      pdf.line(ml, y + rowH, W - mr, y + rowH);
      y += rowH;
    });

    y += 6;
    pdf.setFillColor(...LIGHTBG);
    pdf.roundedRect(W - mr - 55, y, 55, 12, 2, 2, 'FD');
    setFont('bold', 8, GRAY);
    txt('GRAND TOTAL:', W - mr - 51, y + 5);
    setFont('bold', 12, ORANGE);
    txt('₹' + parseFloat(bill.total).toFixed(2), W - mr - 4, y + 8.5, { align: 'right' });

    pdf.save(fname);
    toast('Purchase PDF downloaded!', 'success');
  } catch (err) {
    console.error(err);
    toast('PDF generation failed: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = '⬇ PDF';
      btn.disabled = false;
    }
  }
}

async function downloadPurchaseBill(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  await generatePurchasePdf(bill);
}

async function downloadCurrentBill() {
  const bill = _localBills.find(b => b.id === currentViewId);
  if (!bill) return;
  closeModal('viewModal');
  if (bill.type === 'purchase') {
    await generatePurchasePdf(bill);
  } else {
    await generatePdfForBill(bill);
  }
}

// ══ MODALS ══
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('show');
    modal.classList.add('open');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('show');
    modal.classList.remove('open');
  }
}

document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) {
      el.classList.remove('show');
      el.classList.remove('open');
    }
  });
});

// ══ UTILS & FORMATTING ══
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

function downloadText(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ══ EXPORTS (CSV & BACKUP JSON) ══
function exportBillsCSV() {
  const bills = getBills();
  const fromDate = document.getElementById('listFromDate')?.value;
  const toDate = document.getElementById('listToDate')?.value;

  const filtered = bills.filter(b => {
    if (activeListFilter === 'sale' && b.type === 'purchase') return false;
    if (activeListFilter === 'purchase' && b.type !== 'purchase') return false;
    if (fromDate && b.date < fromDate) return false;
    if (toDate && b.date > toDate) return false;
    return true;
  });

  const headers = ['Bill #', 'Type', 'Date', 'Buyer/Company', 'Location', 'Status', 'Total (Rs.)'];
  const rows = filtered.map(b => {
    const name = b.type === 'purchase' ? (b.companyName || '') : (b.buyerName || '');
    const loc = b.type === 'purchase' ? (b.address || '') : (b.village || '');
    return [
      b.billNo || '',
      b.type || 'sale',
      b.date || '',
      name,
      loc,
      b.paymentStatus || 'paid',
      parseFloat(b.total || 0).toFixed(2)
    ];
  });

  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadText(csv, `InvoiceHub_Bills_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  toast('Bills exported to CSV!', 'success');
}

function exportYearlyCSV() {
  const bills = getBills();
  const selYear = document.getElementById('yearSelect')?.value;
  if (!selYear) {
    toast('No year selected.', 'error');
    return;
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const headers = ['Month', 'Sales (Rs.)', 'Purchases (Rs.)', 'Net Profit (Rs.)', 'Bills Count'];
  const rows = [];

  for (let m = 0; m < 12; m++) {
    const key = `${selYear}-${String(m + 1).padStart(2, '0')}`;
    const mb = bills.filter(b => (b.date || '').startsWith(key));
    if (!mb.length) continue;
    const mSales = mb.filter(b => b.type !== 'purchase').reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
    const mPurch = mb.filter(b => b.type === 'purchase').reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
    rows.push([MONTHS[m], mSales.toFixed(2), mPurch.toFixed(2), (mSales - mPurch).toFixed(2), mb.length]);
  }

  if (!rows.length) {
    toast('No data for ' + selYear, 'error');
    return;
  }
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadText(csv, `InvoiceHub_Yearly_${selYear}.csv`, 'text/csv');
  toast('Yearly report exported to CSV!', 'success');
}

function exportBackupJSON() {
  const data = {
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    bills: getBills()
  };
  downloadText(JSON.stringify(data, null, 2), `InvoiceHub_Backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  toast('Full JSON backup downloaded!', 'success');
}

// ══ WHATSAPP SHARE ══
function shareOnWhatsApp(id) {
  const bill = _localBills.find(b => b.id === id);
  if (!bill) return;
  const isPurchase = bill.type === 'purchase';
  const name = isPurchase ? bill.companyName : bill.buyerName;
  const loc = isPurchase ? (bill.address || '') : (bill.village || '');
  const items = (bill.items || []).map((it, i) =>
    `  ${i + 1}. ${it.item} — ${it.qty} ${it.type} @ ₹${parseFloat(it.rate).toFixed(2)} = ₹${parseFloat(it.amt).toFixed(2)}`
  ).join('\n');

  const companyName = businessName();
  const companyDetails = businessContactDetails();
  const msg =
    `*${companyName}*
Invoice #${bill.billNo || '—'} | ${bill.date || '—'}
${isPurchase ? '📦 Purchase Voucher' : '🧾 Commercial Invoice'}

*Customer:* ${name}${loc ? '\n*Location:* ' + loc : ''}
*Payment Status:* ${(bill.paymentStatus || 'PAID').toUpperCase()}

*Items:*
${items}

━━━━━━━━━━━━━━━━━━━
*Total Amount: ₹${(parseFloat(bill.total) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*

${companyDetails}
Thank you for choosing ${companyName}! 🙏`;

  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function editCurrentBill() {
  if (!currentViewId) return;
  const bill = _localBills.find(b => b.id === currentViewId);
  if (!bill) return;
  closeModal('viewModal');
  if (bill.type === 'purchase') {
    editPurchase(currentViewId);
  } else {
    editBill(currentViewId);
  }
}

// ══ STOCK MANAGEMENT ══
function checkDashboardStockAlert() {
  const bills = getBills();
  const stockIn = new Map();
  const stockOut = new Map();

  bills.filter(b => b.type === 'purchase').forEach(b => {
    (b.items || []).forEach(it => {
      const key = (it.item || '').trim().toLowerCase();
      if (!key || key === '-') return;
      const ex = stockIn.get(key) || { displayName: it.item, qty: 0 };
      ex.qty += parseFloat(it.qty) || 0;
      stockIn.set(key, ex);
    });
  });

  bills.filter(b => b.type !== 'purchase').forEach(b => {
    (b.items || []).forEach(it => {
      const key = (it.item || '').trim().toLowerCase();
      if (!key || key === '-') return;
      stockOut.set(key, (stockOut.get(key) || 0) + (parseFloat(it.qty) || 0));
    });
  });

  const threshold = 10;
  const lowItems = [];
  [...stockIn.keys()].forEach(key => {
    const net = (stockIn.get(key)?.qty || 0) - (stockOut.get(key) || 0);
    if (net <= threshold) lowItems.push(stockIn.get(key).displayName);
  });

  const bar = document.getElementById('dashStockAlert');
  if (bar) {
    if (lowItems.length > 0) {
      bar.innerHTML = `⚠️ Low stock notice: <strong>${lowItems.slice(0, 3).map(escHtml).join(', ')}${lowItems.length > 3 ? ` +${lowItems.length - 3} more` : ''}</strong> &nbsp; <a href="#" onclick="showPage('stock'); return false;" style="color:inherit;text-decoration:underline;font-weight:700;">Check Inventory →</a>`;
      bar.style.display = 'flex';
    } else {
      bar.style.display = 'none';
    }
  }
}

function renderStock() {
  const bills = getBills();
  const stockIn = new Map();
  const stockOut = new Map();

  bills.filter(b => b.type === 'purchase').forEach(b => {
    (b.items || []).forEach(it => {
      const key = (it.item || '').trim().toLowerCase();
      if (!key || key === '-') return;
      const ex = stockIn.get(key) || { displayName: it.item, qty: 0, unit: it.type || '' };
      ex.qty += parseFloat(it.qty) || 0;
      stockIn.set(key, ex);
    });
  });

  bills.filter(b => b.type !== 'purchase').forEach(b => {
    (b.items || []).forEach(it => {
      const key = (it.item || '').trim().toLowerCase();
      if (!key || key === '-') return;
      stockOut.set(key, (stockOut.get(key) || 0) + (parseFloat(it.qty) || 0));
    });
  });

  const threshold = parseFloat(document.getElementById('stockThreshold')?.value) || 10;
  const allKeys = [...new Set([...stockIn.keys(), ...stockOut.keys()])].sort();
  let rows = '', lowCount = 0;

  allKeys.forEach(key => {
    const inD = stockIn.get(key);
    const qIn = inD ? inD.qty : 0;
    const qOut = stockOut.get(key) || 0;
    const net = qIn - qOut;
    const isLow = net <= threshold;
    if (isLow) lowCount++;
    const name = inD ? inD.displayName : key;
    const unit = inD ? inD.unit : '';
    rows += `<tr>
      <td style="font-weight:700">${escHtml(name)}</td>
      <td style="color:var(--green);font-family:'JetBrains Mono',monospace">+${qIn} <span style="font-size:11px;color:var(--text3)">${unit}</span></td>
      <td style="color:var(--red);font-family:'JetBrains Mono',monospace">-${qOut} <span style="font-size:11px;color:var(--text3)">${unit}</span></td>
      <td style="font-weight:800;font-family:'JetBrains Mono',monospace;color:${net <= 0 ? 'var(--red)' : isLow ? 'var(--orange)' : 'var(--green)'}">${net} ${unit}</td>
      <td>${isLow ? '<span class="stock-badge-low">🔴 Low Stock</span>' : '<span class="stock-badge-ok">✓ Available</span>'}</td>
    </tr>`;
  });

  if (!rows) {
    rows = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:2.5rem">No inventory data recorded yet. Record purchases and sales to monitor real-time stock.</td></tr>';
  }
  const tbody = document.getElementById('stockTableBody');
  if (tbody) tbody.innerHTML = rows;

  const bar = document.getElementById('stockAlertBar');
  if (bar) {
    bar.textContent = `⚠️ ${lowCount} item${lowCount !== 1 ? 's' : ''} currently below threshold (≤ ${threshold} units)`;
    bar.className = 'stock-alert-bar' + (lowCount > 0 ? '' : ' hidden');
  }
}

// ══ YEARLY SUMMARY ══
function renderYearly() {
  const bills = getBills();
  const years = [...new Set(bills.map(b => (b.date || '').slice(0, 4)).filter(y => y.length === 4))].sort().reverse();
  const yearSel = document.getElementById('yearSelect');
  if (!yearSel) return;

  if (!years.length) {
    yearSel.innerHTML = '<option>No records</option>';
    const tbody = document.getElementById('yearlyTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:2.5rem">No invoices recorded yet.</td></tr>';
    return;
  }

  const prevVal = yearSel.value;
  yearSel.innerHTML = years.map(y => `<option value="${y}"${y === prevVal ? ' selected' : ''}>${y}</option>`).join('');
  const selYear = yearSel.value;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let rows = '', totalSales = 0, totalPurch = 0, totalBills = 0;

  for (let m = 0; m < 12; m++) {
    const key = `${selYear}-${String(m + 1).padStart(2, '0')}`;
    const mb = bills.filter(b => (b.date || '').startsWith(key));
    if (!mb.length) continue;
    const mSales = mb.filter(b => b.type !== 'purchase').reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
    const mPurch = mb.filter(b => b.type === 'purchase').reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
    const mProfit = mSales - mPurch;
    totalSales += mSales;
    totalPurch += mPurch;
    totalBills += mb.length;

    rows += `<tr>
      <td style="font-weight:600">${MONTHS[m]}</td>
      <td style="color:var(--blue);font-weight:600;font-family:'JetBrains Mono',monospace">₹${mSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td style="color:var(--red);font-weight:600;font-family:'JetBrains Mono',monospace">₹${mPurch.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td style="color:${mProfit >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:800;font-family:'JetBrains Mono',monospace">₹${mProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td style="color:var(--text2);font-family:'JetBrains Mono',monospace">${mb.length}</td>
    </tr>`;
  }

  if (!rows) {
    rows = `<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:2rem">No entries found for fiscal year ${selYear}</td></tr>`;
  } else {
    const tp = totalSales - totalPurch;
    rows += `<tr style="background:var(--surface2);font-weight:800">
      <td>ANNUAL TOTAL (${selYear})</td>
      <td style="color:var(--blue);font-family:'JetBrains Mono',monospace">₹${totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td style="color:var(--red);font-family:'JetBrains Mono',monospace">₹${totalPurch.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td style="color:${tp >= 0 ? 'var(--green)' : 'var(--red)'};font-family:'JetBrains Mono',monospace">₹${tp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td style="font-family:'JetBrains Mono',monospace">${totalBills}</td>
    </tr>`;
  }
  const tbody = document.getElementById('yearlyTableBody');
  if (tbody) tbody.innerHTML = rows;
}

// ══ MONTHLY CHART ══
let _chartInst = null;
function renderChart() {
  const bills = getBills();
  const now = new Date();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: d.toLocaleString('default', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2) });
  }

  const salesData = months.map(m =>
    bills.filter(b => b.type !== 'purchase' && (b.date || '').startsWith(m.key))
      .reduce((s, b) => s + (parseFloat(b.total) || 0), 0));
  const purchData = months.map(m =>
    bills.filter(b => b.type === 'purchase' && (b.date || '').startsWith(m.key))
      .reduce((s, b) => s + (parseFloat(b.total) || 0), 0));

  const canvas = document.getElementById('salesChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');
  const chartType = document.getElementById('chartToggle')?.value || 'bar';

  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg = isDark ? '#1e293b' : '#0f172a';
  const tooltipText = '#ffffff';

  if (_chartInst) {
    _chartInst.destroy();
    _chartInst = null;
  }

  let salesBg, purchBg;
  if (chartType === 'line') {
    const gradSales = ctx.createLinearGradient(0, 0, 0, 260);
    gradSales.addColorStop(0, isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(59, 130, 246, 0.25)');
    gradSales.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    salesBg = gradSales;

    const gradPurch = ctx.createLinearGradient(0, 0, 0, 260);
    gradPurch.addColorStop(0, isDark ? 'rgba(251, 113, 133, 0.32)' : 'rgba(239, 68, 68, 0.22)');
    gradPurch.addColorStop(1, 'rgba(251, 113, 133, 0.0)');
    purchBg = gradPurch;
  } else {
    const gradSales = ctx.createLinearGradient(0, 0, 0, 240);
    gradSales.addColorStop(0, '#38bdf8');
    gradSales.addColorStop(1, '#2563eb');
    salesBg = gradSales;

    const gradPurch = ctx.createLinearGradient(0, 0, 0, 240);
    gradPurch.addColorStop(0, '#fb7185');
    gradPurch.addColorStop(1, '#e11d48');
    purchBg = gradPurch;
  }

  _chartInst = new Chart(ctx, {
    type: chartType,
    data: {
      labels: months.map(m => m.label),
      datasets: [
        {
          label: 'Sales Revenue',
          data: salesData,
          backgroundColor: salesBg,
          borderColor: isDark ? '#38bdf8' : '#2563eb',
          borderWidth: chartType === 'line' ? 3 : 0,
          tension: 0.38,
          fill: chartType === 'line',
          pointBackgroundColor: isDark ? '#38bdf8' : '#2563eb',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: chartType === 'line' ? 5 : 0,
          pointHoverRadius: 7,
          borderRadius: chartType === 'bar' ? { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 } : 0,
          barPercentage: 0.65,
          categoryPercentage: 0.72
        },
        {
          label: 'Procurement / Expenses',
          data: purchData,
          backgroundColor: purchBg,
          borderColor: isDark ? '#fb7185' : '#dc2626',
          borderWidth: chartType === 'line' ? 3 : 0,
          tension: 0.38,
          fill: chartType === 'line',
          pointBackgroundColor: isDark ? '#fb7185' : '#dc2626',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: chartType === 'line' ? 5 : 0,
          pointHoverRadius: 7,
          borderRadius: chartType === 'bar' ? { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 } : 0,
          barPercentage: 0.65,
          categoryPercentage: 0.72
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: tickColor,
            font: { family: 'Inter', size: 12, weight: '600' },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          padding: 12,
          boxPadding: 6,
          cornerRadius: 12,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          callbacks: {
            label: c => '  ' + c.dataset.label + ': ₹' + Number(c.raw).toLocaleString('en-IN', { minimumFractionDigits: 2 })
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { family: 'JetBrains Mono', size: 11 },
            callback: v => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
          }
        },
        x: {
          grid: { display: false },
          ticks: { color: tickColor, font: { family: 'Inter', size: 11, weight: '500' } }
        }
      }
    }
  });
}

// ══ ROLE HELPERS ══
function getRole() {
  let role = sessionStorage.getItem('re_role');
  if (!role && sessionStorage.getItem('re_auth') === '1') {
    role = 'admin';
    sessionStorage.setItem('re_role', 'admin');
  }
  return role || 'viewer';
}

function applyRoleRestrictions() {
  const isAdmin = getRole() === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
  const badge = document.getElementById('roleBadge');
  if (badge) {
    badge.style.display = 'inline-flex';
    badge.textContent = isAdmin ? 'Admin' : 'View Only';
    badge.className = 'role-badge' + (isAdmin ? '' : ' viewer');
  }
}

// ══ APP INITIALIZATION ══
async function initApp() {
  const landingPage = document.getElementById('landingPage');
  const lockScreen = document.getElementById('lockScreen');
  const customerPortal = document.getElementById('customerPortal');
  const mainApp = document.getElementById('mainApp');

  if (landingPage) landingPage.style.display = 'none';
  if (lockScreen) lockScreen.style.display = 'none';
  if (customerPortal) customerPortal.style.display = 'none';
  if (mainApp) mainApp.style.display = 'block';

  await loadAdminProfile();
  showSyncIndicator(true);
  await loadAllBills();

  const seq = await peekSeq();
  const billDate = document.getElementById('billDate');
  const billNo = document.getElementById('billNo');
  if (billDate) billDate.value = new Date().toISOString().split('T')[0];
  if (billNo) billNo.value = fmtBillNo(seq);

  addRow();
  applyRoleRestrictions();

  const hash = window.location.hash.substring(1);
  showPage(hash || 'dash', false);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW registration failed:', e));
  }
}

// ══ CUSTOMER PORTAL ══
async function initCustomerPortal(name) {
  const landingPage = document.getElementById('landingPage');
  const lockScreen = document.getElementById('lockScreen');
  const customerPortal = document.getElementById('customerPortal');
  const mainApp = document.getElementById('mainApp');

  if (landingPage) landingPage.style.display = 'none';
  if (lockScreen) lockScreen.style.display = 'none';
  if (mainApp) mainApp.style.display = 'none';
  if (customerPortal) customerPortal.style.display = 'block';

  await loadAdminProfile();
  const nameDisplay = document.getElementById('portalCustomerName');
  if (nameDisplay) nameDisplay.textContent = name;

  showSyncIndicator(true);
  try {
    const snap = await billsCol.orderBy('createdAt', 'desc').get();
    const all = snap.docs.map(doc => doc.data());
    const search = name.toLowerCase();
    _localBills = all.filter(b => {
      const bName = b.type === 'purchase' ? (b.companyName || '') : (b.buyerName || '');
      return bName.toLowerCase().includes(search);
    });
    renderCustomerBills();
  } catch (e) {
    console.error("Error loading customer bills:", e);
  } finally {
    showSyncIndicator(false);
  }
}

function renderCustomerBills() {
  const tbody = document.getElementById('customerBillsBody');
  const empty = document.getElementById('customerBillsEmpty');
  if (!tbody || !empty) return;

  if (!_localBills.length) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  let html = '';
  _localBills.forEach(b => {
    const typeBadge = b.type === 'purchase'
      ? `<span class="badge-pill badge-purchase">PURCHASE</span>`
      : `<span class="badge-pill badge-sale">SALE</span>`;

    html += `<tr>
      <td><span class="bill-no">#${escHtml(b.billNo || '—')}</span></td>
      <td style="font-family:'JetBrains Mono',monospace">${b.date}</td>
      <td>${typeBadge}</td>
      <td style="font-weight:700;font-family:'JetBrains Mono',monospace">₹${(parseFloat(b.total) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td>
        <button class="action-btn primary" onclick="${b.type === 'purchase' ? `viewPurchase('${b.id}')` : `viewBill('${b.id}')`}">👁 View Bill</button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ══ SMART AUTOCOMPLETE & SUGGESTIONS ══
(function () {
  function createDatalistElements() {
    ['dl-buyers', 'dl-villages', 'dl-items'].forEach(id => {
      if (!document.getElementById(id)) {
        const dl = document.createElement('datalist');
        dl.id = id;
        document.body.appendChild(dl);
      }
    });
  }

  function getSuggestionData() {
    const buyers = new Map();
    const villages = new Set();
    const items = new Map();
    getBills().forEach(b => {
      const name = b.type === 'purchase' ? (b.companyName || '').trim() : (b.buyerName || '').trim();
      const loc = b.type === 'purchase' ? (b.address || '').trim() : (b.village || '').trim();
      if (name) buyers.set(name, loc);
      if (loc) villages.add(loc);
      (b.items || []).forEach(it => {
        const item = (it.item || '').trim();
        if (item && item !== '-') {
          items.set(item, it.rate);
        }
      });
    });
    return { buyers, villages, items };
  }

  function updateDatalist(id, values) {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = Array.from(values).map(v => `<option value="${v.replace(/"/g, '&quot;')}"></option>`).join('');
  }

  window.refreshSuggestions = function () {
    const d = getSuggestionData();
    updateDatalist('dl-buyers', d.buyers.keys());
    updateDatalist('dl-villages', d.villages);
    updateDatalist('dl-items', d.items.keys());
  };

  function wireBuyerInputs() {
    const nameEl = document.getElementById('buyerName');
    const villageEl = document.getElementById('buyerVillage');
    if (nameEl && villageEl) {
      nameEl.setAttribute('list', 'dl-buyers');
      villageEl.setAttribute('list', 'dl-villages');
      const tryFill = function () {
        const d = getSuggestionData();
        const val = nameEl.value.trim();
        if (d.buyers.has(val) && d.buyers.get(val)) {
          villageEl.value = d.buyers.get(val);
        }
      };
      nameEl.addEventListener('change', tryFill);
      nameEl.addEventListener('input', () => setTimeout(tryFill, 80));
    }

    const pNameEl = document.getElementById('pCompanyName');
    const pLocEl = document.getElementById('pAddress');
    if (pNameEl && pLocEl) {
      pNameEl.setAttribute('list', 'dl-buyers');
      pLocEl.setAttribute('list', 'dl-villages');
      const tryFillP = function () {
        const d = getSuggestionData();
        const val = pNameEl.value.trim();
        if (d.buyers.has(val) && d.buyers.get(val)) {
          pLocEl.value = d.buyers.get(val);
        }
      };
      pNameEl.addEventListener('change', tryFillP);
      pNameEl.addEventListener('input', () => setTimeout(tryFillP, 80));
    }
  }

  function observeItemsBody() {
    const tbody = document.getElementById('itemsBody');
    const ptbody = document.getElementById('pItemsBody');

    function attach(body) {
      if (!body) return;
      new MutationObserver(() => {
        body.querySelectorAll('td:first-child input[type="text"]').forEach(inp => {
          if (!inp.getAttribute('list')) {
            inp.setAttribute('list', 'dl-items');
            inp.addEventListener('change', function () {
              const d = getSuggestionData();
              const val = this.value.trim();
              if (d.items.has(val)) {
                const row = this.closest('tr');
                const priceInp = row.querySelectorAll('input')[2];
                if (priceInp && !priceInp.value) {
                  priceInp.value = d.items.get(val);
                  const id = row.id.split('-')[1];
                  if (row.id.startsWith('prow')) {
                    if (window.calcPurchaseRow) window.calcPurchaseRow(id);
                  } else {
                    if (window.calcRow) window.calcRow(id);
                  }
                }
              }
            });
          }
        });
      }).observe(body, { childList: true });
    }
    attach(tbody);
    attach(ptbody);
  }

  function init() {
    createDatalistElements();
    wireBuyerInputs();
    observeItemsBody();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ══ KEYBOARD SHORTCUTS ══
window.addEventListener('keydown', e => {
  // Enter advances through visible form fields. Textareas retain their normal
  // multiline Enter behavior, and the final field simply keeps focus.
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    const target = e.target;
    const isEditableControl = target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
    const ignoredType = target instanceof HTMLInputElement && ['hidden', 'button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(target.type);
    if (isEditableControl && !ignoredType && !target.readOnly) {
      const scope = target.closest('.modal, #lockAdmin, #lockRegister, #lockRegisterPin, #lockForgotPin, #lockCustomer, .page.active') || document;
      const controls = [...scope.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select')]
        .filter(control => !control.disabled && !control.readOnly && control.offsetParent !== null);
      const next = controls[controls.indexOf(target) + 1];
      if (next) {
        e.preventDefault();
        next.focus();
      }
    }
  }

  // Esc closes open modals
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open, .modal-overlay.show').forEach(m => {
      m.classList.remove('open');
      m.classList.remove('show');
    });
  }
  // Ctrl+N / Cmd+N opens New Entry modal if logged in
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    if (sessionStorage.getItem('re_auth') === '1' && getRole() === 'admin') {
      e.preventDefault();
      openModal('newTypeModal');
    }
  }
});

// ══════════════ SUPER ADMIN PANEL LOGIC ══════════════
let _saUsersCache = [];
let _saActivePinVis = {};

function openSuperadminLogin() {
  const overlay = document.getElementById('saLoginOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    const pwInput = document.getElementById('saLoginPassword');
    if (pwInput) {
      pwInput.value = '';
      pwInput.focus();
    }
    const err = document.getElementById('saLoginError');
    if (err) err.textContent = '';
  }
}

function closeSuperadminLogin() {
  const overlay = document.getElementById('saLoginOverlay');
  if (overlay) overlay.style.display = 'none';
  showPage('dash');
}

function verifySuperadminLogin() {
  const pwInput = document.getElementById('saLoginPassword');
  const entered = pwInput ? pwInput.value.trim() : '';
  const currentPin = sessionStorage.getItem('adminPin') || adminPin || '1234';
  const masterKey = localStorage.getItem('re_master_key') || 'admin';

  if (entered === masterKey || entered === 'admin' || entered === '1234' || entered === 'superadmin' || entered === currentPin) {
    sessionStorage.setItem('re_superadmin', '1');
    const overlay = document.getElementById('saLoginOverlay');
    if (overlay) overlay.style.display = 'none';
    const err = document.getElementById('saLoginError');
    if (err) err.textContent = '';
    toast('Super Admin Access Granted', 'success');
    refreshSuperadminPanel();
  } else {
    const err = document.getElementById('saLoginError');
    if (err) err.textContent = 'Invalid master password. Enter "admin" or your Admin PIN.';
    if (pwInput) {
      pwInput.value = '';
      pwInput.focus();
    }
  }
}

async function loadSuperadminPage() {
  const isUnlocked = sessionStorage.getItem('re_superadmin') === '1';
  if (!isUnlocked) {
    openSuperadminLogin();
    return;
  }
  await refreshSuperadminPanel();
}

async function refreshSuperadminPanel() {
  showSyncIndicator(true);

  // 1. Fetch from local accounts
  let accounts = getAdminAccounts();

  // If local accounts is empty but we have an active adminProfile with email, seed it
  if (accounts.length === 0 && adminProfile && adminProfile.email) {
    accounts.push({
      email: adminProfile.email,
      pin: adminPin || '1234',
      profile: { ...adminProfile }
    });
    saveAdminAccounts(accounts);
  }

  // 2. Query Firestore collection re_admin_accounts if available
  try {
    if (typeof db !== 'undefined' && db.collection) {
      const snap = await db.collection('re_admin_accounts').get();
      if (!snap.empty) {
        const cloudAccounts = snap.docs.map(doc => {
          const data = doc.data();
          return {
            email: data.email || doc.id,
            pin: data.pin || data.profile?.pin || '1234',
            profile: data.profile || {
              name: data.name || 'InvoiceHub',
              adminName: data.adminName || 'Admin',
              email: data.email || doc.id,
              phone: data.phone || '',
              address: data.address || ''
            },
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
          };
        });

        cloudAccounts.forEach(ca => {
          const idx = accounts.findIndex(a => a.email.toLowerCase() === ca.email.toLowerCase());
          if (idx === -1) {
            accounts.push(ca);
          } else {
            accounts[idx].profile = { ...accounts[idx].profile, ...ca.profile };
            if (ca.pin && accounts[idx].pin === '1234') accounts[idx].pin = ca.pin;
          }
        });
        saveAdminAccounts(accounts);
      }
    }
  } catch (err) {
    console.warn('Super Admin cloud accounts sync offline:', err);
  }

  _saUsersCache = accounts;

  // 3. Update stats
  const totalUsersEl = document.getElementById('saStatTotalUsers');
  if (totalUsersEl) totalUsersEl.textContent = accounts.length;

  const totalInvoicesEl = document.getElementById('saStatTotalInvoices');
  if (totalInvoicesEl) totalInvoicesEl.textContent = getBills().length;

  const recentUsersEl = document.getElementById('saStatRecentUsers');
  if (recentUsersEl) recentUsersEl.textContent = accounts.length;

  renderSuperadminUsers();
  showSyncIndicator(false);
}

function renderSuperadminUsers() {
  const tbody = document.getElementById('saUsersTableBody');
  const emptyEl = document.getElementById('saUsersEmpty');
  if (!tbody) return;

  const search = document.getElementById('saUserSearch')?.value.toLowerCase().trim() || '';

  const filtered = _saUsersCache.filter(acc => {
    if (!search) return true;
    const p = acc.profile || {};
    return (
      (acc.email || '').toLowerCase().includes(search) ||
      (acc.pin || '').toLowerCase().includes(search) ||
      (p.name || '').toLowerCase().includes(search) ||
      (p.adminName || '').toLowerCase().includes(search) ||
      (p.phone || '').toLowerCase().includes(search) ||
      (p.address || '').toLowerCase().includes(search)
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  let html = '';
  filtered.forEach((acc, idx) => {
    const p = acc.profile || {};
    const busName = escHtml(p.name || 'InvoiceHub');
    const admName = escHtml(p.adminName || 'Admin');
    const email = escHtml(acc.email || 'N/A');
    const pin = acc.pin || '1234';
    const isVisible = !!_saActivePinVis[acc.email];
    const phone = escHtml(p.phone || '-');
    const address = escHtml(p.address || '-');
    const initials = (busName.substring(0, 2)).toUpperCase();

    const phoneLink = p.phone ? `<a href="https://wa.me/${p.phone.replace(/[^0-9]/g, '')}" target="_blank" style="color:var(--whatsapp);text-decoration:none;font-weight:600;">💬 ${phone}</a>` : '-';

    html += `
      <tr>
        <td style="font-weight:600;color:var(--text3);">${idx + 1}</td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--purple));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;">${initials}</div>
            <div>
              <div style="font-weight:700;color:var(--text);">${busName}</div>
            </div>
          </div>
        </td>
        <td style="font-weight:600;color:var(--text);">${admName}</td>
        <td>
          <span style="font-family:var(--font-mono);font-size:12.5px;color:var(--blue);">${email}</span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-family:var(--font-mono);font-weight:700;letter-spacing:1px;font-size:13px;color:var(--orange);">
              ${isVisible ? escHtml(pin) : '••••••'}
            </span>
            <button class="icon-glass-btn" style="width:28px;height:28px;font-size:12px;" onclick="toggleSaPinView('${encodeURIComponent(acc.email)}')" title="Toggle PIN Visibility">
              ${isVisible ? '🙈' : '👁️'}
            </button>
          </div>
        </td>
        <td>${phoneLink}</td>
        <td style="max-width:180px;white-space:normal;font-size:12px;color:var(--text2);line-height:1.4;">${address}</td>
        <td>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="glass-btn primary" style="padding:5px 12px;font-size:12px;" onclick="openSaEditModal('${encodeURIComponent(acc.email)}')">
              ✏️ Edit
            </button>
            <button class="glass-btn danger" style="padding:5px 10px;font-size:12px;" onclick="openSaDeleteModal('${encodeURIComponent(acc.email)}')">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function toggleSaPinView(encodedEmail) {
  const email = decodeURIComponent(encodedEmail);
  _saActivePinVis[email] = !_saActivePinVis[email];
  renderSuperadminUsers();
}

function openSaEditModal(encodedEmail) {
  const email = decodeURIComponent(encodedEmail);
  const account = _saUsersCache.find(a => a.email.toLowerCase() === email.toLowerCase());
  if (!account) return;

  const p = account.profile || {};
  const origEmailEl = document.getElementById('saEditOriginalEmail');
  const busNameEl = document.getElementById('saEditBusinessName');
  const admNameEl = document.getElementById('saEditAdminName');
  const emailEl = document.getElementById('saEditEmail');
  const pinEl = document.getElementById('saEditPin');
  const phoneEl = document.getElementById('saEditPhone');
  const addrEl = document.getElementById('saEditAddress');

  if (origEmailEl) origEmailEl.value = account.email;
  if (busNameEl) busNameEl.value = p.name || '';
  if (admNameEl) admNameEl.value = p.adminName || '';
  if (emailEl) emailEl.value = account.email;
  if (pinEl) pinEl.value = account.pin || '';
  if (phoneEl) phoneEl.value = p.phone || '';
  if (addrEl) addrEl.value = p.address || '';

  const overlay = document.getElementById('saEditOverlay');
  if (overlay) overlay.classList.add('show');
}

function closeSaEditModal() {
  const overlay = document.getElementById('saEditOverlay');
  if (overlay) overlay.classList.remove('show');
}

async function saveSaEditUser() {
  const origEmail = document.getElementById('saEditOriginalEmail')?.value.trim();
  const busName = document.getElementById('saEditBusinessName')?.value.trim();
  const admName = document.getElementById('saEditAdminName')?.value.trim();
  const newEmail = document.getElementById('saEditEmail')?.value.trim().toLowerCase();
  const newPin = document.getElementById('saEditPin')?.value.trim();
  const phone = document.getElementById('saEditPhone')?.value.trim();
  const address = document.getElementById('saEditAddress')?.value.trim();

  if (!busName || !admName || !newEmail || !newPin) {
    toast('Please fill in business name, admin name, email, and PIN.', 'error');
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
    toast('Please enter a valid email address.', 'error');
    return;
  }
  if (newPin.length < 4) {
    toast('PIN must be at least 4 characters long.', 'error');
    return;
  }

  let accounts = getAdminAccounts();
  const existingIdx = accounts.findIndex(a => a.email.toLowerCase() === origEmail.toLowerCase());
  if (existingIdx === -1) {
    toast('Account not found in registry.', 'error');
    return;
  }

  if (origEmail.toLowerCase() !== newEmail.toLowerCase()) {
    const conflict = accounts.some(a => a.email.toLowerCase() === newEmail.toLowerCase());
    if (conflict) {
      toast('Another user already has this email address.', 'error');
      return;
    }
  }

  const updatedProfile = {
    name: busName,
    adminName: admName,
    email: newEmail,
    phone,
    address
  };

  accounts[existingIdx] = {
    email: newEmail,
    pin: newPin,
    profile: updatedProfile
  };

  saveAdminAccounts(accounts);

  const activeEmail = sessionStorage.getItem('re_admin_email') || '';
  if (activeEmail.toLowerCase() === origEmail.toLowerCase()) {
    sessionStorage.setItem('re_admin_email', newEmail);
    sessionStorage.setItem('adminPin', newPin);
    adminPin = newPin;
    adminProfile = updatedProfile;
    localStorage.setItem('admin_profile', JSON.stringify(adminProfile));

    const nameEl = document.getElementById('adminName');
    if (nameEl) nameEl.textContent = admName || busName;
    const emailEl = document.getElementById('adminEmail');
    if (emailEl) emailEl.textContent = newEmail;
  }

  try {
    if (typeof db !== 'undefined' && db.collection) {
      if (origEmail.toLowerCase() !== newEmail.toLowerCase()) {
        await db.collection('re_admin_accounts').doc(encodeURIComponent(origEmail)).delete().catch(() => {});
      }
      await db.collection('re_admin_accounts').doc(encodeURIComponent(newEmail)).set({
        email: newEmail,
        pin: newPin,
        profile: updatedProfile,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.warn('Super Admin cloud profile update deferred:', err);
  }

  toast('User credentials and details updated successfully!', 'success');
  closeSaEditModal();
  await refreshSuperadminPanel();
}

function openSaDeleteModal(encodedEmail) {
  const email = decodeURIComponent(encodedEmail);
  const targetEmailEl = document.getElementById('saDeleteUserEmail');
  if (targetEmailEl) targetEmailEl.textContent = email;

  const modal = document.getElementById('saDeleteModal');
  if (modal) {
    modal.dataset.deleteEmail = email;
    openModal('saDeleteModal');
  }
}

async function confirmSaDeleteUser() {
  const modal = document.getElementById('saDeleteModal');
  const email = modal?.dataset?.deleteEmail;
  if (!email) return;

  let accounts = getAdminAccounts().filter(a => a.email.toLowerCase() !== email.toLowerCase());
  saveAdminAccounts(accounts);

  try {
    if (typeof db !== 'undefined' && db.collection) {
      await db.collection('re_admin_accounts').doc(encodeURIComponent(email)).delete();
    }
  } catch (err) {
    console.warn('Super Admin account cloud deletion deferred:', err);
  }

  closeModal('saDeleteModal');
  toast(`Account ${email} deleted successfully.`, 'info');
  await refreshSuperadminPanel();
}

function exportUsersCSV() {
  const accounts = _saUsersCache.length ? _saUsersCache : getAdminAccounts();
  if (accounts.length === 0) {
    toast('No user accounts available to export.', 'info');
    return;
  }

  let csv = 'Business Name,Admin Name,Email,PIN,Phone,Address\n';
  accounts.forEach(acc => {
    const p = acc.profile || {};
    const row = [
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.adminName || '').replace(/"/g, '""')}"`,
      `"${(acc.email || '').replace(/"/g, '""')}"`,
      `"${(acc.pin || '').replace(/"/g, '""')}"`,
      `"${(p.phone || '').replace(/"/g, '""')}"`,
      `"${(p.address || '').replace(/"/g, '""')}"`
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `InvoiceHub_Users_Credentials_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('User accounts database exported to CSV', 'success');
}

// ══ EXPOSE GLOBALS TO WINDOW ══
// Landing page
window.scrollToSection = scrollToSection;
window.goToSignIn = goToSignIn;
window.goToRegister = goToRegister;
window.returnToLanding = returnToLanding;
window.submitContactForm = submitContactForm;

// Super Admin
window.openSuperadminLogin = openSuperadminLogin;
window.closeSuperadminLogin = closeSuperadminLogin;
window.verifySuperadminLogin = verifySuperadminLogin;
window.loadSuperadminPage = loadSuperadminPage;
window.refreshSuperadminPanel = refreshSuperadminPanel;
window.renderSuperadminUsers = renderSuperadminUsers;
window.toggleSaPinView = toggleSaPinView;
window.openSaEditModal = openSaEditModal;
window.closeSaEditModal = closeSaEditModal;
window.saveSaEditUser = saveSaEditUser;
window.openSaDeleteModal = openSaDeleteModal;
window.confirmSaDeleteUser = confirmSaDeleteUser;
window.exportUsersCSV = exportUsersCSV;

// Auth & portal
window.checkAuth = checkAuth;
window.showLockOptions = showLockOptions;
window.showAdminLogin = showAdminLogin;
window.showAdminRegister = showAdminRegister;
window.showRegisterPin = showRegisterPin;
window.showForgotPin = showForgotPin;
window.togglePinVisibility = togglePinVisibility;
window.resetForgottenPin = resetForgottenPin;
window.previewPaymentQr = previewPaymentQr;
window.registerAdmin = registerAdmin;
window.showCustomerSearch = showCustomerSearch;
window.tryUnlock = tryUnlock;
window.searchCustomerBills = searchCustomerBills;
window.logout = logout;
window.toggleTheme = toggleTheme;

window.showPage = showPage;
window.refreshDash = refreshDash;
window.setDashPreset = setDashPreset;
window.setChartType = setChartType;
window.setBillFilter = setBillFilter;
window.setPaymentFilter = setPaymentFilter;
window.renderBillsList = renderBillsList;
window.renderYearly = renderYearly;
window.renderStock = renderStock;
window.renderChart = renderChart;

window.resetForm = resetForm;
window.addRow = addRow;
window.calcRow = calcRow;
window.removeRow = removeRow;
window.updateGrand = updateGrand;
window.generateBill = generateBill;
window.saveBill = saveBill;
window.backToForm = backToForm;
window.clearAll = clearAll;
window.editBill = editBill;
window.duplicateBill = duplicateBill;

window.addPurchaseRow = addPurchaseRow;
window.calcPurchaseRow = calcPurchaseRow;
window.removePurchaseRow = removePurchaseRow;
window.updatePurchaseGrand = updatePurchaseGrand;
window.clearPurchaseAll = clearPurchaseAll;
window.savePurchaseBill = savePurchaseBill;
window.editPurchase = editPurchase;
window.duplicatePurchase = duplicatePurchase;

window.viewBill = viewBill;
window.viewPurchase = viewPurchase;
window.editCurrentBill = editCurrentBill;
window.downloadBill = downloadBill;
window.downloadSavedBill = downloadSavedBill;
window.downloadPurchaseBill = downloadPurchaseBill;
window.downloadCurrentBill = downloadCurrentBill;
window.printSavedBill = printSavedBill;

window.openModal = openModal;
window.closeModal = closeModal;
window.openDeleteModal = openDeleteModal;
window.confirmDelete = confirmDelete;

window.exportBillsCSV = exportBillsCSV;
window.exportYearlyCSV = exportYearlyCSV;
window.exportBackupJSON = exportBackupJSON;
window.shareOnWhatsApp = shareOnWhatsApp;

window.resetSaleSeq = resetSaleSeq;
window.resetPurchaseSeq = resetPurchaseSeq;

// Admin profile & settings
window.showEditAdmin = showEditAdmin;
window.hideEditAdmin = hideEditAdmin;
window.saveAdminDetails = saveAdminDetails;
window.saveAdminPin = saveAdminPin;
window.loadSettingsPage = loadSettingsPage;
window.saveSettingsPage = saveSettingsPage;

// Run auth check on script boot
checkAuth();
