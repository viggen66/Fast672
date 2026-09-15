Newer Host for Fast672 Webhost, with direct GoldHen load without use Mira-Loader, making the fastest webhost for 6.72

https://viggen66.github.io/Fast672/

The way the exploit is triggled, enabling webkit exploit on load, it can happen OOM when caching the webhost to the console, just repeat until cache is done with success.

## Overview

A browser-based JavaScript project designed to support **GoldHEN payload loading** in compatible PlayStation environments. It combines memory access primitives, runtime address resolution, and native execution infrastructure.

## Key Features
- **Memory access:** Arbitrary memory read/write operations and JavaScript object address discovery.
- **Runtime address resolution:** resolution: Resolves WebKit and system library bases using predefined offsets.
- **Post-execution cleanup:** Prepares return-oriented programming chains and native function calls.
- **Automatic syscall discovery:** Identifies syscall entry points within system library memory.
- **Payload loading:** Provides logic to copy an embedded payload into allocated memory and invoke it.
- **Post-execution cleanup:** Restores selected modified pointers and clears temporary references.
- **Performance and Memory Management**

Uses typed arrays, reusable buffers, and cached references to reduce repeated allocations and property lookups. Cleanup routines help manage temporary objects after execution.

<img width="1537" height="759" alt="image" src="https://github.com/user-attachments/assets/8b77393f-be6e-41ba-8010-41c10e3d0103" />



