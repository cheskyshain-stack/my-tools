/* ============================================================================
   CJ Music - shared playback volume boost
   ----------------------------------------------------------------------------
   HTML5 <audio>.volume tops out at 1.0, which isn't loud enough for some
   recordings. Routing playback through Web Audio lets us push past that
   ceiling. Currently used by the full player (music/index.html) only.

   Chain: source -> compressor -> gain -> limiter -> destination.
   - compressor: levels the track first (pulls loud peaks down, effectively
     raises quiet parts relative to them) so the gain boost afterward can
     be pushed noticeably harder while staying clean - the same basic
     technique broadcast/streaming loudness normalization uses, not just
     a bigger multiplier.
   - gain: the actual user-controlled boost amount.
   - limiter: a hard ceiling AFTER the gain (threshold -1dB, ratio 20:1)
     so the boosted signal is guaranteed not to clip regardless of the
     chosen amount or how hot the source recording already is - the
     compressor alone only reduces dynamic range going in, it doesn't
     guarantee the gain stage's output afterward stays under 0dBFS.

   The level is user-adjustable and persisted, rather than a single fixed
   guess baked into the code.

   Usage:
     const boost = createAudioBoost(audioEl);       // reads the saved level, defaults to 3x
     await boost.resume();  audioEl.play();          // right before playing
     boost.setAmount(3.5);                           // live-adjust + persist
   ============================================================================ */
const CJ_BOOST_KEY = "cjMusicBoostAmount";
const CJ_BOOST_DEFAULT = 3;
function getSavedBoostAmount(){
  try{
    const v = parseFloat(localStorage.getItem(CJ_BOOST_KEY));
    return isFinite(v) && v > 0 ? v : CJ_BOOST_DEFAULT;
  }catch(e){ return CJ_BOOST_DEFAULT; }
}

function createAudioBoost(audioEl, amount){
  amount = amount || getSavedBoostAmount();
  let ctx, gain, compressor, limiter, source;

  function ensure(){
    if (source) return;
    try{
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      source = ctx.createMediaElementSource(audioEl);

      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -30; // start compressing well before full volume
      compressor.knee.value = 20;       // smooth transition into compression
      compressor.ratio.value = 16;      // fairly aggressive leveling
      compressor.attack.value = 0.003;  // fast enough to catch transients
      compressor.release.value = 0.25;

      gain = ctx.createGain();
      gain.gain.value = amount;

      // A hard ceiling AFTER the gain, not just the leveling compressor
      // before it. The compressor reduces dynamic range going in, but the
      // gain stage multiplies whatever comes out of it - at the higher
      // boost levels (up to 3.5x = +10.9dB) that can still push loud
      // passages past 0dBFS on some recordings, which is heard as harsh,
      // crackly clipping distortion ("the sound is not good"), not
      // low-volume. This limiter only engages right at the ceiling
      // (threshold -1dB, ratio 20:1 - the max the API allows, essentially
      // brick-wall) so it stays inaudible/transparent until something
      // would actually clip, regardless of boost level or how hot the
      // source recording already is.
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;

      source.connect(compressor).connect(gain).connect(limiter).connect(ctx.destination);
    }catch(e){ /* Web Audio unavailable - falls back to normal, unboosted volume */ }
  }

  // Call this right before (or together with) audioEl.play(). Resuming a
  // suspended AudioContext is asynchronous - calling it without awaiting
  // and immediately starting playback anyway is a real race: playback can
  // begin while the context is still "suspended", so the boost isn't
  // actually in effect yet for however long that takes to resolve. That's
  // the inconsistent "sometimes loud, sometimes quiet" behavior. Awaiting
  // this first makes the boost reliably active before sound plays.
  async function resume(){
    ensure();
    if (ctx && ctx.state === "suspended"){
      try{ await ctx.resume(); }catch(e){}
    }
  }

  function setAmount(newAmount){
    amount = newAmount;
    if (gain) gain.gain.value = amount;
    try{ localStorage.setItem(CJ_BOOST_KEY, String(amount)); }catch(e){}
  }
  function getAmount(){ return amount; }

  // Keep in sync with changes made by OTHER same-origin documents. The
  // shell's persistent mini-player and the full /music/ app are separate
  // documents (parent window + iframe) - the shell loads once and stays
  // alive for the whole visit, so without this its boost amount would
  // freeze at whatever it was when the shell first loaded and never learn
  // about a change made later from within /music/, leaving the two out of
  // sync (one louder/clearer than the other). The native 'storage' event
  // fires on every OTHER same-origin window when localStorage changes
  // (never on the window that made the change itself) - exactly the
  // parent-shell / child-iframe relationship here, no messaging needed.
  window.addEventListener("storage", (e) => {
    if (e.key !== CJ_BOOST_KEY || e.newValue == null) return;
    const v = parseFloat(e.newValue);
    if (isFinite(v) && v > 0){
      amount = v;
      if (gain) gain.gain.value = amount;
    }
  });

  return { ensure, resume, setAmount, getAmount };
}
