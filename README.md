# tiny-stack-vm

A faithful interpreter of make.fun's tiny stack ISA v1. `main.ts` runs every
instance in `MAKEFUN_INPUT_DIR` and writes each answer's `stdout.bin` and
`exit.txt` under `MAKEFUN_OUTPUT_DIR`. All ten traps, with their own exit
codes, in the ISA's check order.
