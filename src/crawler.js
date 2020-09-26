import fetch from 'node-fetch';
import fs from 'fs';
import checksum from 'checksum';
import diff from 'diff-arrays-of-objects';
import nodemailer from 'nodemailer';
import path from 'path';

const success = 'success';

const dbpath = path.join(__dirname, '../', 'db');
const createPropertyList = (list) => {
  return list.map((property) => {
    const link = `https://ingatlan.com/${property.id}`;
    return `
      <tr style="background:#fff">
        <td rowspan="2" style="text-align:center;padding:5px 15px;border-bottom:1px solid #dddddd">
        <a href="${link}" target="_blank">
          <img src="${property.cover}" width="84" height="64" alt="Részletek" style="border:2px solid #ffffff;outline:1px solid #dddddd" class="CToWUd">
        </a>
        </td>
        <td colspan="6" style="height:30px;vertical-align:bottom;text-align:left;font-size:13px">
        <a href="${link}" target="_blank">
          ${property.address}
        </a>
        -
        <a href="${link}#terkep" target="_blank">
        térkép
        </a>
        </td>
      </tr>
      <tr style="background:#fff;font-size:14px">
        <td style="text-align:left;padding:5px 1px;border-bottom:1px solid #dddddd;height:30px;vertical-align:top">
        <b style="font-size:16px">${property.price}</b> </td>
        <td style="padding:5px 1px;border-bottom:1px solid #dddddd;vertical-align:top">családi ház</td>
        <td style="text-align:center;padding:5px 1px;border-bottom:1px solid #dddddd;vertical-align:top">
        <b style="font-size:16px">${property.size}</b> </td>
        <td style="text-align:center;padding:5px 1px;border-bottom:1px solid #dddddd;vertical-align:top">
        <b style="font-size:16px">${property.garden}</b> </td>
        <td style="text-align:center;padding:5px 1px;border-bottom:1px solid #dddddd;vertical-align:top">
        <b style="font-size:16px">${(property.info.split('|') || [])[1]}</b> </td>
        <td style="text-align:center;padding:5px 15px 0 0;color:#a5a5a5;border-bottom:1px solid #dddddd;vertical-align:top" width="1%">
      &nbsp; </td>
      </tr>
    `;
  });
};

const createTable = (title, list) => `<h3>${title}</h3><br/><table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial;font-size:12px">
<tbody><tr style="padding:0 0 5px 0;background:#f4f4f4;font-size:12px;border-top:1px solid #dddddd">
<th style="border-top:1px solid #ddd;border-bottom:1px solid #ddd">&nbsp;</th>
<th style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;font-weight:normal;padding:8px 0;text-align:left">ár</th>
<th style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;font-weight:normal">típus</th>
<th style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;font-weight:normal">lakóterület</th>
<th style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;font-weight:normal">telek terület</th>
<th style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;font-weight:normal">szobák száma</th>
<th style="border-top:1px solid #ddd;border-bottom:1px solid #ddd;font-weight:normal">&nbsp;</th>
</tr>${createPropertyList(list)}</tbody></table><br/><br/>`;


const notify = async ({ added, removed, updated }) => {
  let transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: (process.env || {}).email_user, // generated ethereal user
      pass: (process.env || {}).email_pass, // generated ethereal password
    },
  });

  try {
   // send mail with defined transport object
    let info = await transporter.sendMail({
      from: '\'ingatlan.com bot\' <istvan.makary@gmail.com>', // sender address
      to: 'istvan.makary@gmail.com, csehlillabogi@gmail.com', // list of receivers
      subject: 'Eladó házak', // Subject line
      text: 'HTML response', // plain text body
      html: [
        added.length && createTable('új hirdetések', added),
        removed.length && createTable('inaktivált hirdetések', removed),
        updated.length && createTable('frissült hirdetések', updated),
      ].filter(Boolean).join(''), // html body
    });
    console.log(info.response);
  } catch (e) {
    console.log(e);
  }
};

const fetchProperties = async (page) => {
  if (!Number.isInteger(page)) {
    return {};
  }
  const { status, data } = await fetch(`https://mobile-gateway.ingatlan.com/v1/ads/search/elado+haz+veroce+kismaros?page=${page}`, {
    headers: {
      'Content-Type': 'application/json',
      apiLevel: 111,
      buildNumber: 1591344216,
    },
  }).then((res) => res.json());

  if (status !== success) {
    return {};
  }

  return { data: data.list || [], pages: data.pages || 0 };

};

const storeProperties = (properties) => {
  const data = properties.map(({ id, addressTitle, price, formattedExtraInfo, areaSize, lotSize, contactData, photos = [] }) => ({
    id,
    price,
    address: addressTitle,
    size: areaSize,
    garden: lotSize,
    info: formattedExtraInfo,
    number: contactData.phoneNumbers[0] || '',
    cover: photos[0] || '',
  }));

  const db = fs.readFileSync(dbpath);

  if (checksum(db) !== checksum(JSON.stringify(data))) {
    if (db) {
      try {
        const { added, removed, updated } = diff(JSON.parse(db), data, 'id');

        notify({ added, removed, updated });

        fs.writeFileSync(dbpath, JSON.stringify(data));
      } catch (e) {
        console.log('error', e);
      }
    } else {
      fs.writeFileSync(dbpath, JSON.stringify(data));
    }
  } else {
    console.log('No change');
  }
};

const fetchAllProperties = async () => {
  let properties = [];
  const updateProperties = (data = []) => {
    properties = [
      ...properties,
      ...data,
    ];
  };

  const { pages, data } = await fetchProperties(1);
  updateProperties(data);

  const recursiveFetch = async (page) => {
    if (page === 1) {
      console.log('Fetch done');
      storeProperties(properties);
      return;
    }

    const result = await fetchProperties(page);
    updateProperties(result.data);

    setTimeout(() => recursiveFetch(page - 1), 1000);
  };

  recursiveFetch(pages);
};

setInterval(fetchAllProperties, 1000 * 60 * 10);
fetchAllProperties();
