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

### 🔍 Powerful GoTo Node ID Back-Search & Locate
No more manually clicking and expanding deeply nested folders! Simply press `/` or `f` to focus the search bar:
* **Standard Resolution**: Type a standard Node ID like `ns=2;s=MyVariable` and press **Enter**. The client automatically does a server-wide hierarchical parent lookup, expands the tree levels, scrolls, and selects the target node.
* **Alternative Formats**: Supports `nsi=2;s=MyVariable` (shorthand for namespace index).
* **Dynamic Namespace URI Resolution (`nsu=`)**: Search using Namespace URIs like `nsu=http://samples.org/UA/MyNamespace;s=MyVariable`. The client automatically queries the server's `NamespaceArray` node at runtime, maps the URI to its integer index, and resolves it!
* **UX Color Indicators**:
  * **Yellow**: Recognized as a valid Node ID pattern while typing.
  * **Green / White**: Successfully navigated to.
  * **Orange**: The node exists, but the server does not support inverse browsing (or cannot trace the parent hierarchy back to the root folder).
  * **Red**: The node does not exist or failed to resolve.
* **Instant Clear**: Press `Ctrl-U` to instantly clear the search box!

### 🧭 Smart Node History & Jump Navigation
* Tracks your browsing history.
* Easily jump backwards (`Left Arrow` on collapsed root or `Backspace`) and jump forwards through your visited paths for lightning-fast comparisons.

### 📐 Engineering Units & EURange Enrichment
* Automatically reads associated `EURange` and `EngineeringUnits` companion properties.
* Enhances the displayed `Value` attribute on-the-fly (e.g., displaying `42.5 °C`).
* Adds a distinct `EURange` attribute line (e.g., `[ 0, 100 ]`) for clear engineering context.

### 🗂️ HasSubtype Mode Filtering
* When exploring type hierarchies inside the `Types` folder, toggle **Subtype Mode** to restrict navigation to subtype structures (`HasSubtype` references) instead of mixing in standard instances, keeping your types tree clean and organized.

### 📈 Live Variable Monitoring
* Hit `m` on any variable node to start monitoring it in real-time. Live transactions and updates stream directly into your Monitored Items panel.

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

License: [MIT](LICENSE)
