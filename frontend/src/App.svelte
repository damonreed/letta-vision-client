<script>
  import { onMount } from "svelte";
  import Agents from "./routes/Agents.svelte";
  import Chat from "./routes/Chat.svelte";
  import Files from "./routes/Files.svelte";
  import Images from "./routes/Images.svelte";
  import Mcp from "./routes/Mcp.svelte";
  import Providers from "./routes/Providers.svelte";
  import { currentTab, initFromHash, setTab } from "./lib/stores.js";

  let tab = $state("agents");

  onMount(() => {
    initFromHash();
    const unsub = currentTab.subscribe((t) => (tab = t));
    const onHash = () => initFromHash();
    window.addEventListener("hashchange", onHash);
    return () => {
      unsub();
      window.removeEventListener("hashchange", onHash);
    };
  });

  function navigate(t) {
    setTab(t);
  }
</script>

<div class="app">
  <header>
    <h1>letta-vision-client</h1>
    <nav>
      <button class:active={tab === "agents"} onclick={() => navigate("agents")}>
        Agents
      </button>
      <button class:active={tab === "providers"} onclick={() => navigate("providers")}>
        Providers
      </button>
      <button class:active={tab === "chat"} onclick={() => navigate("chat")}>
        Chat
      </button>
      <button class:active={tab === "files"} onclick={() => navigate("files")}>
        Files
      </button>
      <button class:active={tab === "images"} onclick={() => navigate("images")}>
        Images
      </button>
      <button class:active={tab === "mcp"} onclick={() => navigate("mcp")}>
        MCP
      </button>
    </nav>
  </header>
  <main>
    <div class="tab-panel" class:hidden={tab !== "agents"}>
      <Agents />
    </div>
    <div class="tab-panel" class:hidden={tab !== "providers"}>
      <Providers />
    </div>
    <div class="tab-panel" class:hidden={tab !== "chat"}>
      <Chat />
    </div>
    <div class="tab-panel" class:hidden={tab !== "files"}>
      <Files />
    </div>
    <div class="tab-panel" class:hidden={tab !== "images"}>
      <Images />
    </div>
    <div class="tab-panel" class:hidden={tab !== "mcp"}>
      <Mcp />
    </div>
  </main>
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 0.75rem 1.25rem;
    background: #fff;
    border-bottom: 1px solid #ddd;
  }
  h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }
  nav {
    display: flex;
    gap: 0.5rem;
  }
  nav button {
    padding: 0.4rem 0.9rem;
    border: 1px solid #ccc;
    background: #fff;
    border-radius: 4px;
  }
  nav button.active {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
  }
  main {
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  .tab-panel {
    height: 100%;
    overflow: hidden;
  }
  .tab-panel.hidden {
    display: none;
  }
</style>
