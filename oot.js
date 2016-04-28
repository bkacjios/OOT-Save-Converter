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

oot.getSaveSlotValueShort = function(save, slot, pos) {
	var slot = save[slot];

	var low = slot[pos];
	var high = slot[pos+1];

	return (low << 8) + high;
}

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

oot.SAVE_DATA = oot.createBlankSave();

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

	save[slot+1] = raw;
	save[slot+1+3] = raw;

	oot.verifySave(raw);
}

oot.updateSlotsFromSave = function(save) {
	for (var i=1; i<=3; i++) {
		var name = oot.getSaveSlotName(save, i);
		var rupees = oot.getSaveSlotValueShort(save, i, 0x0034);
		var deaths = oot.getSaveSlotValueShort(save, i, 0x0022);
		var containers = oot.getSaveSlotValueShort(save, i, 0x002E);
		var hearts = oot.getSaveSlotValueShort(save, i, 0x0030);

		console.log(name, rupees, deaths, containers / 0x10, hearts / 0x10);
		document.getElementById('name'+i).innerHTML = name;
		document.getElementById('rupees'+i).innerHTML = rupees;
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

oot.expandFile = function() {
	this.open = this.open ? false : true;
	this.style.height = this.open ? 171 : 49;
	this.children[1].style.opacity = this.open ? 1 : 0;
	this.children[1].style.height = this.open ? 110 : 0;
	this.children[1].style.visibility = this.open ? 'visible' : 'hidden';

	var slots = document.getElementsByClassName('slot');

	for (var i=0; i<slots.length; i++) {
		var slot = slots[i];
		if (slot == this) continue;
		slot.open = false;
		slot.style.height = 49;
		slot.children[1].style.opacity = 0;
		slot.children[1].style.height = 0;
		slot.children[1].style.visibility = 'hidden';
	}
}

document.getElementById('slot1').addEventListener('click', oot.expandFile);
document.getElementById('slot2').addEventListener('click', oot.expandFile);
document.getElementById('slot3').addEventListener('click', oot.expandFile);