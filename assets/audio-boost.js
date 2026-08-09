/* ============================================================================
   CJ Music — shared playback volume boost
   ----------------------------------------------------------------------------
   HTML5 <audio>.volume tops out at 1.0, which isn't loud enough for some
   recordings. Routing playback through a Web Audio GainNode lets us push
   past that ceiling. This is the ONE canonical implementation, loaded by
   both the full player (music/index.html) and the persistent mini-player
   in the site shell (index.html) — previously each had its own separate
   copy, which is exactly the kind of drift that causes inconsistent
   behavior between the two.

   Usage:
     const boost = createAudioBoost(audioEl);       // boost defaults to 1.8x
     await boost.resume();  audioEl.play();          // right before playing
   ============================================================================ */
function createAudioBoost(audioEl, amount){
  amount = amount || 1.8;
  let ctx, gain, source;

  function ensure(){
    if (source) return;
    try{
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      source = ctx.createMediaElementSource(audioEl);
      gain = ctx.createGain();
      gain.gain.value = amount;
      source.connect(gain).connect(ctx.destination);
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

  return { ensure, resume };
}
