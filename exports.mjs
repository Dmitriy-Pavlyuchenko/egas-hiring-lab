import {Buffer} from 'node:buffer';

const xml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const crcTable = Array.from({length:256}, (_,i)=>{
  for(let j=0;j<8;j++) i=i&1 ? 0xedb88320^(i>>>1) : i>>>1;
  return i>>>0;
});
function zip(files) {
  const items=[], directory=[];
  let offset=0, directorySize=0;
  for(const [path,content] of Object.entries(files)) {
    const name=Buffer.from(path), data=Buffer.from(content);
    let crc=0xffffffff;
    for(const byte of data) crc=crcTable[(crc^byte)&255]^(crc>>>8);
    crc=(crc^0xffffffff)>>>0;
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4);
    local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(name.length,26);
    const entry=Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20,4); entry.writeUInt16LE(20,6);
    entry.writeUInt32LE(crc,16); entry.writeUInt32LE(data.length,20); entry.writeUInt32LE(data.length,24);
    entry.writeUInt16LE(name.length,28); entry.writeUInt32LE(offset,42);
    items.push(local,name,data); directory.push(entry,name);
    offset+=local.length+name.length+data.length; directorySize+=entry.length+name.length;
  }
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(directory.length/2,8); end.writeUInt16LE(directory.length/2,10);
  end.writeUInt32LE(directorySize,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...items,...directory,end]);
}
function excel(material) {
  const spreadsheet='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relationships='http://schemas.openxmlformats.org/package/2006/relationships';
  const office='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rows=[material.columns,...material.rows].map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>{
    const ref=String.fromCharCode(65+j)+(i+1);
    return typeof value==='number' ? '<c r="'+ref+'"><v>'+value+'</v></c>' : '<c r="'+ref+'" t="inlineStr"><is><t>'+xml(value)+'</t></is></c>';
  }).join('')+'</row>').join('');
  return zip({
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':'<Relationships xmlns="'+relationships+'"><Relationship Id="rId1" Type="'+office+'/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<workbook xmlns="'+spreadsheet+'" xmlns:r="'+office+'"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<Relationships xmlns="'+relationships+'"><Relationship Id="rId1" Type="'+office+'/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':'<worksheet xmlns="'+spreadsheet+'"><sheetData>'+rows+'</sheetData></worksheet>'
  });
}
function pdf(lines) {
  const pageText='BT /F1 14 Tf 52 785 Td 25 TL '+lines.map(line=>'('+line.replace(/[\\()]/g,'\\$&')+') Tj T*').join('\n')+' ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+Buffer.byteLength(pageText)+' >>\nstream\n'+pageText+'\nendstream'
  ];
  let out='%PDF-1.4\n';
  const offsets=objects.map((object,i)=>{
    const position=Buffer.byteLength(out);
    out+=(i+1)+' 0 obj\n'+object+'\nendobj\n';
    return position;
  });
  return Buffer.from(out+'xref\n0 6\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+Buffer.byteLength(out)+'\n%%EOF\n');
}
export function exportMaterial(material, original) {
  if(material.type==='xlsx') return ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',original??excel(material)];
  if(material.type==='pdf') return ['application/pdf',original??pdf(material.lines)];
  return ['text/plain; charset=utf-8',original??Buffer.from('# '+material.title+'\n\n'+material.body+'\n')];
}
