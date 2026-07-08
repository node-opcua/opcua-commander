# OPC UA Commander 🚀

[![Get it from the Snap Store](https://snapcraft.io/static/images/badges/en/snap-store-black.svg)](https://snapcraft.io/opcua-commander)
[![npm version](https://img.shields.io/npm/v/opcua-commander.svg?style=flat-square)](https://www.npmjs.com/package/opcua-commander)
[![License](https://img.shields.io/npm/l/opcua-commander.svg?style=flat-square)](LICENSE)

A premium, interactive, terminal-based visual OPC UA client explorer. Built on top of the powerful [node-opcua](https://github.com/node-opcua/node-opcua) stack and curses-based blessed UI.

No bulky heavy GUI dependencies required. It is fast, lightweight, and perfect for remote diagnostics, embedded gateways, or developer console workflows.

---

![OPC UA Commander Demo](https://raw.githubusercontent.com/node-opcua/opcua-commander/master/docs/demo.gif)

---

## 🌟 Key Features

### 🌲 Interactive Address Space Explorer Tree
* **Visual Node Tree**: Fluid, keyboard-driven navigation through the entire OPC UA hierarchical Address Space (Objects, Variables, Types, and Views).
* **Dynamic Node Expand/Collapse**: Smoothly expand and contract branches dynamically to discover child nodes and complex structures on-the-fly.

### 📋 Full Attribute & Property Inspector
* **Live Details**: Displays all standard attributes of the currently selected node (including Node ID, BrowseName, DisplayName, Description, DataType, Value, NodeClass, AccessLevel, UserAccessLevel, Historizing, and more).
* **Attribute Writing**: Edit and write new values to Variable attributes directly from the interactive UI.

### 🔗 Dynamic Reference Explorer
* **Bi-directional Browsing**: Explore all references linked to the selected node. Toggle views to show only Forward references, Backward references, or All references.

### 🎯 Powerful GoTo Node ID Back-Search & Locate (New!)
No more manually clicking and expanding deeply nested folders! Simply press `/` or `f` to focus the search bar:
* **Standard Resolution**: Type a standard Node ID like `ns=2;s=MyVariable` and press **Enter**. The client automatically performs a server-wide hierarchical parent lookup, expands the tree levels, scrolls, and selects the target node.
* **Alternative Formats**: Supports `nsi=2;s=MyVariable` (shorthand for namespace index).
* **Dynamic Namespace URI Resolution (`nsu=`)**: Search using Namespace URIs like `nsu=http://samples.org/UA/MyNamespace;s=MyVariable`. The client automatically queries the server's `NamespaceArray` node at runtime, maps the URI to its integer index, and resolves it!
* **UX Color Indicators**:
  * **Yellow**: Recognized as a valid Node ID pattern while typing.
  * **Green / White**: Successfully navigated to.
  * **Orange**: The node exists, but the server does not support inverse browsing (or cannot trace the parent hierarchy back to the root folder).
  * **Red**: The node does not exist or failed to resolve.
* **Instant Clear**: Press `Ctrl-U` to instantly clear the search box!

### 🧭 Smart Node History & Jump Navigation
* Tracks your browsing history as you explore.
* Easily jump backwards (`Left Arrow` on collapsed root or `Backspace`) and jump forwards through your visited paths for lightning-fast comparisons.

### 📐 Engineering Units & EURange Enrichment
* Automatically reads associated `EURange` and `EngineeringUnits` companion properties.
* Enhances the displayed `Value` attribute on-the-fly (e.g., displaying `42.5 °C`).
* Adds a distinct `EURange` attribute line (e.g., `[ 0, 100 ]`) for clear engineering context.

### 🗂️ HasSubtype Mode Filtering
* When exploring type hierarchies inside the `Types` folder, toggle **Subtype Mode** to restrict navigation to subtype structures (`HasSubtype` references) instead of mixing in standard instances, keeping your types tree clean and organized.

### 📈 Real-time Variable Monitoring & Subscriptions
* Hit `m` on any Variable node to instantly subscribe and start monitoring it in real-time. Live transactions and updates stream directly into your Monitored Items panel.

### ⚡ Remote Server Method Calls
* Execute server-side methods directly from the curses-based command UI. Allows inputting parameters and seeing returned values.

### 🔐 Secure Connections & Security Profiles
* Full support for anonymous connections as well as Username/Password authentication.
* Configurable with various Message Security Modes (`None`, `Sign`, `SignAndEncrypt`) and Security Policies (`Basic128Rsa15`, `Basic256`, `Basic256Sha256`, `Aes128_Sha256_RsaOaep`, etc.).

### 🖥️ Built-in Logger Console
* Live transaction, message size, subscription events, renewal logs, and error diagnostic reporting inside a separate, clearable log panel.

---

## 🛠️ Installation & Usage

### 📦 Via npm (Global)
```bash
npm install -g opcua-commander
opcua-commander -e opc.tcp://localhost:26543
```
*Note for Ubuntu/Linux users experiencing EACCES permission errors:*
```bash
sudo npm install -g opcua-commander --unsafe-perm=true --allow-root
```

### 🛍️ Via Snap Store
```bash
sudo snap install opcua-commander
opcua-commander -e opc.tcp://localhost:26543
```

### 🐳 Via Docker
Build the docker image:
```bash
docker build . -t opcua-commander
```
Run the docker image:
```bash
docker run -it opcua-commander -e opc.tcp://localhost:26543
```

### 🛠️ From Source
```bash
git clone https://github.com/node-opcua/opcua-commander.git
cd opcua-commander
npm install
npm run build
node bin/opcua-commander -e opc.tcp://localhost:26543
```

---

## 🎹 Interactive Keyboard Shortcuts

### Address Space Explorer Tree
* **`Arrow Up / Down`**: Navigate through tree items.
* **`Arrow Right / +`**: Expand folder.
* **`Arrow Left / -`**: Collapse folder.
* **`f` or `/`**: Activate Search/Filter Bar.
* **`m`**: Monitor current node.
* **`H`**: View history/attributes panel.
* **`r`**: Refresh current node children.
* **`q` or `Ctrl-C`**: Quit.

### Search Bar (Active Mode)
* **`F3`**: Next string match (standard search).
* **`Shift-F3`**: Previous string match (standard search).
* **`Ctrl-U`**: Instantly clear the entire search box.
* **`Enter`**: Apply search, or execute GoTo Node ID search if Node ID format is matched.
* **`Escape`**: Cancel search and close the search bar.

---

## 🤝 Contributing
Contributions, bug reports, and suggestions are always welcome! Feel free to open issues or pull requests on [GitHub](https://github.com/node-opcua/opcua-commander).

---

## 💎 Created & Maintained by Sterfive
`opcua-commander` and the underlying [node-opcua](https://github.com/node-opcua/node-opcua) stack are proudly designed, developed, and maintained by **[Sterfive](https://www.sterfive.com/)**, the leading expert organization in industrial IoT, OPC UA technology, custom client/server integrations, and professional support.

Need professional support, custom industrial IoT features, or enterprise-grade OPC UA guidance? Visit **[sterfive.com](https://www.sterfive.com/)** or reach out for expert consulting services.

License: [MIT](LICENSE)

