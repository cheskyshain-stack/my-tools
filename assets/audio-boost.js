/* ============================================================================
   CJ Music — shared playback volume boost
   ----------------------------------------------------------------------------
   HTML5 <audio>.volume tops out at 1.0, which isn't loud enough for some
   recordings. Routing playback through Web Audio lets us push past that
   ceiling. This is the ONE canonical implementation, loaded by both the
   full player (music/index.html) and the persistent mini-player in the
   site shell (index.html) — previously each had its own separate copy,
   which is exactly the kind of drift that causes inconsistent behavior
   between the two.

   A plain gain multiplier alone runs into a ceiling fast: push it too
   high and the loud parts of the track clip (harsh, crackly distortion),
   which caps how much louder you can safely go. A DynamicsCompressorNode
   ahead of the gain levels the track first — it pulls loud peaks down and
   effectively raises quiet parts relative to them — so the gain boost
   afterward can be pushed noticeably harder while staying clean. This is
   the same basic technique broadcast/streaming loudness normalization
   uses, not just a bigger multiplier.

   The level is user-adjustable and persisted (shared across the full
   player and the shell's mini-player, since both read the same saved
   value) rather than a single fixed guess baked into the code.

   Usage:
     const boost = createAudioBoost(audioEl);       // reads the saved level, defaults to 2.4x
     await boost.resume();  audioEl.play();          // right before playing
     boost.setAmount(3.0);                           // live-adjust + persist
   ============================================================================ */
const CJ_BOOST_KEY = "cjMusicBoostAmount";
const CJ_BOOST_DEFAULT = 2.4;
function getSavedBoostAmount(){
  try{
    const v = parseFloat(localStorage.getItem(CJ_BOOST_KEY));
    return isFinite(v) && v > 0 ? v : CJ_BOOST_DEFAULT;
  }catch(e){ return CJ_BOOST_DEFAULT; }
}

function createAudioBoost(audioEl, amount){
  amount = amount || getSavedBoostAmount();
  let ctx, gain, compressor, source;

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

      source.connect(compressor).connect(gain).connect(ctx.destination);
    }catch(e){ /* Web Audio unavailable — falls back to normal, unboosted volume */ }
  }

  // Call this right before (or together with) audioEl.play(). Resuming a
  // suspended AudioContext is asynchronous — calling it without awaiting
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

  return { ensure, resume, setAmount, getAmount };
}
