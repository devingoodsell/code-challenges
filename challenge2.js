/* Challenge: http://challenge2.airtime.com:2324/instructions
 * Solution Author: Devin Goodsell
 * Date: 01/08/2014
 *
 * You are an intelligence officer and your mission, should you choose to accept it, is to make sense of
 * a transmission that we captured on our spy satellites. In order to download the transmission dump,
 * you must connect to the TCP server at challenge2.airtime.com:2323

 * In order to authenticate with the server, the client must perform a handshake:

 * Upon connection, the server will send you a handshake packet: "WHORU:<challenge number>\n" without quotes,
 * encoded in UTF-8. You must then send an identification packet:
 * "IAM:<challenge number>:<user email address>:at\n" without quotes, encoded in UTF-8.
 * If the identification was successful, the server will respond with a success packet containing your
 * identification code. "SUCCESS:<identification code>\n" without quotes, encoded in UTF-8. Once the server sends
 * the success packet, it will begin sending the entire satellite dump over the socket.

 * In order to help understand the transmission, we have stolen an excerpt of a secret document that may help.
 *   2.1
 *      Each packet has the following structure:
 *       0   4   8   12
 *       +---+---+---+=============================+
 *       |SEQ|CHK|LEN|…LEN bytes of raw Linear PCM |
 *       +---+---+---+=============================+
 *     CHK (Checksum)
 *     The 32-bit checksum is calculated by XOR'ing each 32-bit chunk of
 *     the 4 byte big-endian sequence number(SEQ) and data.  If LEN is
 *     not a multiple of 4, the byte 0xAB shall be used in place of the
 *     missing bytes only for the purpose of calculating the checksum.
 *
 * Hint: Next steps will become apparent once you are able to understand the transmission.
 *
 * Hint: Some interesting websites that may be useful for your mission are FFmpeg and Audacity
 */
/* jslint node:true, esnext:true */
'use strict';

const
  HOST_ADDRESS = 'challenge2.airtime.com',
  HOST_PORT = 2323,
  EMAIL = 'devingoodsell@gmail.com',
  DUMP_FILE = 'transmission.dump',
  DATA_FILE = 'pcmdata.raw',
  fs = require('fs'),
  net = require('net'),
  StringDecoder = require('string_decoder').StringDecoder
;

var
  transmissionStarted = false,
  identificationCode = null,
  writeStream = null,
  client = null,
  utf8Decoder = new StringDecoder('utf8'),

  /*
   * Routes in-bound TCP communication to the proper functionality to handle payload.
   */
  routeInboundData = function(raw) {
    if (transmissionStarted) {
      console.log('Recieving data...');
      writeStream.write(raw);
    } else {
      let encodedString = utf8Decoder.write(raw);

      if (encodedString.match(/WHORU/i)) {
        console.log('Responding to challenge');
        let challengeNumber = encodedString.substring(encodedString.indexOf(':')+1,encodedString.length-1);
        client.write('IAM:' + challengeNumber + ':ho@hidy.com:at\n'.toString('utf8'));
      } else if (encodedString.match(/SUCCESS/i)) {
        transmissionStarted = true;
        identificationCode = encodedString.substring(encodedString.indexOf(':')+1,encodedString.length-1);
        console.log('Challenge accepted. Generated identity code: ' + identificationCode);
      } else {
        console.log("Received unknown data: ", encodedString);
      }
    }
  },

  /*
   * The 32-bit checksum is calculated by XOR'ing each 32-bit chunk of
   * the 4 byte big-endian sequence number(SEQ) and data.  If LEN is
   * not a multiple of 4, the byte 0xAB shall be used in place of the
   * missing bytes only for the purpose of calculating the checksum.
   */
  verifyChecksum = function(packet) {
    var
      checkValue = new Buffer(4),
      checkBuffer = null
    ;

    packet.sequenceBuff.copy(checkValue);

    // Determine the modulus 4 based buffer if current is not modulus 4 and expand buffer.
    if (packet.data.length % 4 !== 0) {
      let offset = getOffsetForMod(4, packet.data.length);
      checkBuffer = new Buffer(packet.data.length + offset);
      packet.data.copy(checkBuffer);
      checkBuffer.fill(0xAB, packet.data.length, packet.data.length+offset);
    } else {
      checkBuffer = packet.data;
    }

    for (let i = 0; i < checkBuffer.length; i+=4) {
      checkValue = xorBytes(checkValue, checkBuffer.slice(i,i+4));
    }

    return isBufferEqual(checkValue, packet.checksumBuff);
  },

  /*
   * Performs XOR parity check on two buffers.
   */
  xorBytes = function(a, b) {
    var result = [];

    if (a.length > b.length) {
      for (let i = 0; i < b.length; i++) {
        result.push(a[i] ^ b[i]);
      }
    } else {
      for (let i = 0; i < a.length; i++) {
        result.push(a[i] ^ b[i]);
      }
    }

    return new Buffer(result);
  },

  /*
   * Compares two buffers for equality in their data.
   */
  isBufferEqual = function(a, b) {
    if (a.length !== b.length)
      return false;

    for (let i = 0; i < a.length; i++) {
        if (a[i] != b[i])
            return false;
    }

    return true;
  },

  /*
   * Gets the amount that needs to be added to the length to make it evenly divided by the amout provided in mod.
   * NOTES: Probably a much better way of doing this, but for simplicity just adding a quick function
   */
  getOffsetForMod = function(mod, length) {
    var counter = 0;
    while (((length + counter) % mod) !== 0) {
      counter++;
    }
    return counter;
  },

  /*
   * Processes the data from the dump
   */
  processData = function(buffer, callback) {
    var
      result = {},
      position = 0,
      writeStream = null
    ;

    while (position < buffer.length) {
      let packet = {
        sequence: buffer.readUInt32BE(position),
        length: buffer.readUInt32BE(position+8),
        sequenceBuff: buffer.slice(position, position+4),
        checksumBuff: buffer.slice(position+4, position+8),
      };
      packet.data = buffer.slice(position+12, position+12+packet.length);
      position += (12+packet.length);

      if (verifyChecksum(packet)) {
        if (result[packet.sequence] === undefined)
          result[packet.sequence] = packet.data;
        else
          console.log('Duplicate sequence encountered.');
      }
    }

    writeStream = fs.createWriteStream(DATA_FILE);
    for (let key in result) {
      writeStream.write(result[key]);
    }
    writeStream.end();
    callback();
  },

  /*
   * Reads the file jsut downloaded and sends it off for processing.
   */
  processDownloadedFile = function(callback) {
    fs.readFile(DUMP_FILE, function(err, data) {
      if (err)
        return console.log(err);

      processData(data, callback);
    });
  },

  /*
   * Starts the dowlnoad of the transmission file from the TCP server.
   */
  startDownload = function(callback) {
    writeStream = fs.createWriteStream(DUMP_FILE);

    client = net.connect({host: HOST_ADDRESS, port: HOST_PORT}, function () {
      console.log('TCP Connection created: ' + HOST_ADDRESS + ':' + HOST_PORT);
    });

    client.on('data', routeInboundData);

    client.on('end', function(data) {
      writeStream.end();
      console.log('TCP Connection closed.');
      callback();
    });

    client.on('error', function(err){
      console.log('Error: ', err);
    });
  },

  /*
   * Cleans up any files that were generated previously
   */
  cleanupOldFiles = function(callback) {
    fs.exists(DUMP_FILE, function(exists) {
      if (exists) {
        fs.unlink(DUMP_FILE, function(err) {
          if (err)
            console.log("Error on dump file removal: ", err);
          else
            console.log("Removed old dump file.");
        });
      }
      fs.exists(DATA_FILE, function(exists) {
        fs.unlink(DATA_FILE, function(err) {
          if (err)
            console.log("Error on data file removal: ", err);
          else
            console.log("Removed old data file.");
        });
      });
      callback();
    });
  }
;

cleanupOldFiles(function() {
  console.log('Starting download...');
  startDownload(function(){
    console.log('Successfully downloaded transmission. Starting processing...');
    processDownloadedFile(function() {
      console.log('Successfully generated PCM file.');
    });
  });
});


