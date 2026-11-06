// Minimal stored ZIP fixture writer, so extraction tests use real archives without dependencies.
export function zipFixture(entries) {
  const files=[], directory=[];let offset=0;
  for(const entry of entries) {
    const name=Buffer.from(entry.name), bytes=Buffer.from(entry.content??'');let crc=0xffffffff;
    for(const byte of bytes) {crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    crc=(crc^0xffffffff)>>>0;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x0314,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(entry.attributes??0x81a40000,38);central.writeUInt32LE(offset,42);
    files.push(local,name,bytes);directory.push(central,name);offset+=local.length+name.length+bytes.length;
  }
  const index=Buffer.concat(directory), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...files,index,end]);
}
