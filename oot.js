String.format = function(format) {
	var args = Array.prototype.slice.call(arguments, 1);
	return format.replace(/{(\d+)}/g, function(match, number) { 
		return typeof args[number] != 'undefined' ? args[number] : match;
	});
};

Array.prototype.save = function(name) {
	var a = document.createElement("a");

	document.body.appendChild(a);

    var blob = new Blob(this, {type: "octet/stream"});
    var url = window.URL.createObjectURL(blob);

    a.href = url;
    a.download = name;
    a.click();

    window.URL.revokeObjectURL(url);
	document.body.removeChild(a);
}

var oot = {
	// The OOT save file header in hex
	SAVE_HEADER: [
		0x00, 0x00, 0x00, 0x98, 0x09, 0x10, 0x21, 0x5A, 0x45, 0x4C, 0x44, 0x41, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	],

	// Locations in ram for all versions of OOT
	RAM_OFFSETS: [
		0x11A5D0, // NTSC 1.0
		0x11A790, // NTSC 1.1
		0x11AC80, // NTSC 1.2
		0x1183D0, // PAL 1.0
		0x118410  // PAL 1.1
	],

	UPLOAD_SLOT: 1,

	// Lengths of each section of save data
	SAVE_STRUCT: [
		0x20,	// Header
		0x1450, // Slot 1
		0x1450, // Slot 2
		0x1450, // Slot 3
		0x1450, // Backup 1
		0x1450, // Backup 2
		0x1450, // Backup 3
		0x600	// Junk
	],

	// Flip the byte order of raw binary data
	swap: function(data) {
		// Create a buffer
		var buff = [];

		// Iterate through the data
		for (var j=0; j < data.length; j+=4) {
			// Insert every 4 bytes into buffer in reverse
			buff[j]		= data[j+3];
			buff[j+1]	= data[j+2];
			buff[j+2]	= data[j+1];
			buff[j+3]	= data[j];
		}

		// Join it all together and return
		return buff;
	},

	// CRC hash raw binary data
	crc: function(data, size) {
		// Start calculating the CRC of the save data
		var checksum = 0;

		// Iterate through the data
		for (var j=0; j < size; j+=2)
			checksum += (data[j] << 8) + data[j+1];
		
		// Take last 16 bits
		checksum = checksum & 0x00FFFF;

		// Return hash
		return checksum;
	}

}

oot.CHARACTER_MAP = [];
oot.CHARACTER_MAP[223] = " ";
oot.CHARACTER_MAP[228] = "-";
oot.CHARACTER_MAP[234] = ".";

for (var i=0; i<=9; i++)
	oot.CHARACTER_MAP[i] = String.fromCharCode(i + 48);

for (var i=171; i<=196; i++)
	oot.CHARACTER_MAP[i] = String.fromCharCode(i - 106);

for (var i=197; i<=222; i++)
	oot.CHARACTER_MAP[i] = String.fromCharCode(i - 100);

oot.createBlankSave = function() {
	// Initialize save data
	var save = [];

	// Insert the header
	save[0] = new Uint8Array(this.SAVE_HEADER);

	// Fill the save data chunks with 0's
	for (var i=1; i<=6; i++) {
		save[i] = new Uint8Array(0x1450);
	}

	// Unused data at end of file
	save[7] = new Uint8Array(0x600);

	// Return save data array
	return save;
}

oot.verifySave = function(data) {
	// Calculate the save data hash
	var checksum = oot.crc(data, 0x1352);

	// Take the lower byte of the CRC saved within the file
	var low = data[0x1352];
	// Take the higher byte of the CRC saved within the file
	var high = data[0x1353];

	// Combine the low and high end bytes into an actual hash
	var hash = (low << 8) + high;

	// Check for CRC integrity
	if (checksum != hash)
		alert(String.format("WARNING: {0} {1} CRC mismatch (got {2} expected {3})", ((i<=3) ? "File" : "Backup"), i, checksum.toString(16), hash.toString(16)));
}

oot.importSaveFromSRA = function(data) {
	// Initialize save data
	var save = [];

	// Start reading from 0
	var readPos = 0;

	// Index of the save slot
	var chunkIndex = 0;

	// Seperate all the save data into chunks for easy array access
	for (var i=0; i < oot.SAVE_STRUCT.length; i++) {

		// How much data we need to read for this chunk
		var readLen = oot.SAVE_STRUCT[i];

		// Read the chunk and swap it
		var raw = oot.swap(data.slice(readPos, readPos + readLen));

		// Increase read position
		readPos += readLen;

		// Verify save chunks
		if (readLen == 0x1450)
			oot.verifySave(raw);

		// Insert the chunk
		save[chunkIndex++] = new Uint8Array(raw);
	}

	// Return save data array
	return save;
}

oot.importSaveFromRAM = function(data, version, save, slot) {
	var offset = oot.RAM_OFFSETS[version];

	var raw = data.slice(offset, offset + 0x1450);

	var checksum = oot.crc(raw, 0x1352);

	// Update file CRC
	raw[0x1352] = checksum >> 8;
	raw[0x1353] = checksum & 0xFF;

	// Update file index
	raw[0x1354] = slot;

	// Update save data for file
	save[slot+1] = raw;
	// Update save data for backup
	save[slot+1+3] = raw;

	// Expand the file slot
	oot.expandFile(document.getElementById('slot'+(slot+1)), true);

	// Verify save data and display any problems
	oot.verifySave(raw);
}

oot.getSaveSlotName = function(save, slot) {
	var slot = save[slot];
	var data = slot.slice(0x0024, 0x0024 + 8);

	var name = [];

	for (var i=0; i<data.length; i++) {
		if (data[i] == 0) continue;
		name[i] = oot.CHARACTER_MAP[data[i]];
	}

	return name.join("");
}

oot.getSaveShort = function(save, slot, pos) {
	var slot = save[slot];

	var low = slot[pos];
	var high = slot[pos+1];

	return (low << 8) + high;
}


oot.getSaveBit = function(save, slot, pos, bit) {
	var slot = save[slot];

	var data = slot[pos];

	return (data & (1 << bit)) >> bit;
}

oot.updateSlotsFromSave = function(save) {
	for (var i=1; i<=3; i++) {
		var name = oot.getSaveSlotName(save, i);
		var rupees = oot.getSaveShort(save, i, 0x0034);
		var deaths = oot.getSaveShort(save, i, 0x0022);
		var containers = oot.getSaveShort(save, i, 0x002E) / 0x10;
		var hearts = oot.getSaveShort(save, i, 0x0030);
		var goldskulltula = oot.getSaveShort(save, i, 0x00D0);

		if (containers < 3)
			containers = 3;

		var heartsTop = containers < 10 ? containers : 10;
		var heartsBot = containers - heartsTop;

		var top = document.getElementById('hearts'+i+"top");
		var bot = document.getElementById('hearts'+i+"bot")

		top.style.width = heartsTop * 32;
		bot.style.width = heartsBot * 32;

		var defense = save[i][0x00CF];

		if (defense > 0) {
			top.setAttribute("class", "heartsdefense");
			bot.setAttribute("class", "heartsdefense");
		} else {
			top.setAttribute("class", "hearts");
			bot.setAttribute("class", "hearts");
		}

		document.getElementById('name'+i).innerHTML = name;
		document.getElementById('rupees'+i).innerHTML = rupees;
		document.getElementById('deaths'+i).innerHTML = deaths;
		document.getElementById('skulltulas'+i).innerHTML = goldskulltula;

		var completion = {
			kokiri: oot.getSaveBit(save, i, 0x0ED5, 7),
			goron:  oot.getSaveBit(save, i, 0x0ED9, 5),
			zora:  oot.getSaveBit(save, i, 0x0EDB, 7),

			forest:  oot.getSaveBit(save, i, 0x0EDC, 0),
			fire:  oot.getSaveBit(save, i, 0x0EDC, 1),
			water:  oot.getSaveBit(save, i, 0x0EDC, 2),
			spirit:  oot.getSaveBit(save, i, 0x0EEC, 0),
			shadow:  oot.getSaveBit(save, i, 0x0EDC, 0),
			light:  oot.getSaveBit(save, i, 0x0EDD, 5)
		}

		for (var key in completion) {
			var value = completion[key];
			var icon = document.getElementById(key+i);
			icon.style.visibility = value ? 'visible' : 'hidden';
		}
	}
}

oot.upload = function(type) {
	document.getElementById('fileupload'+type).click();
}

oot.download = function() {
	var save = oot.SAVE_DATA;

	var data = [];

	for (var i=0; i<=7; i++)
		data[i] = new Uint8Array(oot.swap(save[i]));

	data.save("THE LEGEND OF ZELDA.sra");
}

oot.updateSaveSettings = function(save) {
	var header = save[0];

	var soundOptions = document.getElementsByName('sound');
	for(var radio in soundOptions) {
		var but = soundOptions[radio];
		but.checked = header[0x00] == but.value;
	}

	var ztargetOptions = document.getElementsByName('ztarget');
	for(var radio in ztargetOptions) {
		var but = ztargetOptions[radio];
		but.checked = header[0x01] == but.value;
	}
}

oot.handleSRASelect = function(evt) {
    var reader = new FileReader();
    reader.onload = function (e) {
    	var data = new Uint8Array(e.target.result);
    	oot.SAVE_DATA = oot.importSaveFromSRA(data);
    	oot.updateSlotsFromSave(oot.SAVE_DATA);
    	oot.updateSaveSettings(oot.SAVE_DATA)
    };
    reader.onerror = function (e) {
        console.error(e);
    };
    reader.readAsArrayBuffer(evt.target.files[0]);

	evt.target.form.reset();
}

oot.handleRAMSelect = function(evt) {
    var reader = new FileReader();

    var version = document.getElementById("version").selectedIndex;
    var file = document.getElementById("file").selectedIndex;

    reader.onload = function (e) {
    	var data = new Uint8Array(e.target.result);
    	oot.importSaveFromRAM(data, version, oot.SAVE_DATA, file);
    	oot.updateSlotsFromSave(oot.SAVE_DATA);
    };
    reader.onerror = function (e) {
        console.error(e);
    };
    reader.readAsArrayBuffer(evt.target.files[0]);

	evt.target.form.reset();
}

oot.updateSaveSoundSettings = function() {
	var header = oot.SAVE_DATA[0];
	header[0x00] = this.value;
}

oot.updateZTargetSettings = function() {
	var header = oot.SAVE_DATA[0];
	header[0x01] = this.value;
}

oot.SAVE_DATA = oot.createBlankSave();

document.getElementById('fileuploadSRA').addEventListener('change', oot.handleSRASelect, false);
document.getElementById('fileuploadRAM').addEventListener('change', oot.handleRAMSelect, false);

var soundOptions = document.getElementsByName('sound');
for(var i in soundOptions) {
	soundOptions[i].onclick = oot.updateSaveSoundSettings
}

var ztargetOptions = document.getElementsByName('ztarget');
for(var i in ztargetOptions) {
	ztargetOptions[i].onclick = oot.updateZTargetSettings
}

oot.expandFile = function(div, open) {
	if (open)
		div.open = open;
	else
		div.open = div.open ? false : true;

	div.style.height = div.open ? 171 : 49;
	div.children[1].style.opacity = div.open ? 1 : 0;
	div.children[1].style.height = div.open ? 98 : 0;
	div.children[1].style.padding = div.open ? 12 : 0;
	div.children[1].style.visibility = div.open ? 'visible' : 'hidden';

	var slots = document.getElementsByClassName('slot');

	for (var i=0; i<slots.length; i++) {
		var slot = slots[i];
		if (slot == div) continue;
		slot.open = false;
		slot.style.height = 49;
		slot.children[1].style.opacity = 0;
		slot.children[1].style.height = 0;
		slot.children[1].style.padding = 0;
		slot.children[1].style.visibility = 'hidden';
	}
}

oot.clickFile = function() {
	oot.expandFile(this);
}

document.getElementById('slot1').addEventListener('click', oot.clickFile);
document.getElementById('slot2').addEventListener('click', oot.clickFile);
document.getElementById('slot3').addEventListener('click', oot.clickFile);