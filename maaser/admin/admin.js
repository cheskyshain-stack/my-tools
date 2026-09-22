(() => {
  'use strict';
  const API = 'https://maaser-tracker.cheskyshain.workers.dev';
  const $ = (id) => document.getElementById(id);
  let key = sessionStorage.getItem('maaser-admin-key') || '';
  $('key').value = key;
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const message = (s) => { $('message').textContent = s; };
  const link = (token) => `${location.origin}/maaser/#t=${token}`;
  async function api(path, options = {}) {
    const response = await fetch(API + path, { ...options, headers: { 'content-type':'application/json', 'x-maaser-admin-key':key, ...(options.headers || {}) } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Request failed.');
    return body;
  }
  async function refresh() {
    const { trackers } = await api('/api/admin/trackers');
    $('admin').hidden = false;
    $('list').innerHTML = trackers.length ? trackers.map((t) => `<div class="mz-field"><strong>${escape(t.label)}</strong> <small>(${escape(t.status)})</small><br><button class="mz-btn" data-reset="${escape(t.id)}" data-label="${escape(t.label)}">Issue replacement link</button></div>`).join('') : '<p>No admin-created trackers yet.</p>';
  }
  function issued(token) {
    const value = link(token);
    $('issued').hidden = false;
    $('issued').innerHTML = `<h2>Invitation link</h2><p>Copy and send this now. It will not be shown again. The recipient creates their PIN when they first open it.</p><div class="mz-link-box"><code>${escape(value)}</code></div><button class="mz-btn" id="copy-link">Copy link</button>`;
    $('copy-link').onclick = async () => { try { await navigator.clipboard.writeText(value); message('Link copied.'); } catch { message('Select and copy the link above.'); } };
  }
  $('unlock').onclick = async () => {
    key = $('key').value.trim();
    try { await refresh(); sessionStorage.setItem('maaser-admin-key', key); message('Admin opened.'); }
    catch (error) { $('admin').hidden = true; message(error.message); }
  };
  $('create').onsubmit = async (event) => {
    event.preventDefault();
    try { const result = await api('/api/admin/trackers', { method:'POST', body:JSON.stringify({ label:$('label').value.trim() }) }); issued(result.token); $('label').value = ''; await refresh(); message('Invitation created.'); }
    catch (error) { message(error.message); }
  };
  $('list').onclick = async (event) => {
    const button = event.target.closest('[data-reset]');
    if (!button || !confirm(`Replace access for ${button.dataset.label}? The old link and PIN will stop working immediately, but records will stay.`)) return;
    try { const result = await api(`/api/admin/trackers/${button.dataset.reset}/reset`, { method:'POST' }); issued(result.token); await refresh(); message('Replacement link issued. Send it to the person.'); }
    catch (error) { message(error.message); }
  };
  if (key) refresh().catch(() => { sessionStorage.removeItem('maaser-admin-key'); key = ''; $('key').value = ''; });
})();
