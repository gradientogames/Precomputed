// Placeholder self-hosted C# adapter
// Replace this file with a real adapter that defines self.CSHARP_BACKEND.compileAndRun
// See: public/vendor/README-ADAPTERS.md

(function(){
  function notInstalled(){
    throw new Error(
      'C# backend not installed. Place your adapter at /public/vendor/csharp/csharp-backend.js with required .NET WASM + Roslyn assets. See public/vendor/README-ADAPTERS.md.'
    )
  }
  self.CSHARP_BACKEND = {
    compileAndRun: async function(source){
      notInstalled()
    }
  }
})();
