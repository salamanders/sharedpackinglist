/* globals gapi, google, URLSearchParams */
/*jshint esversion: 8 */
/*jshint unused:true */

import * as auth from "./auth.js";

const
    /** @type {string} */ API_KEY = 'TODO',
    /** @type {string} */ CLIENT_ID = '41375837279-ul8kqn6dcl6270mlnh70gpgbhkqe1v8u.apps.googleusercontent.com',
    /** @type {Object[]} */ APIS = [{
        'gapi': 'spreadsheets',
        'discovery': 'https://sheets.googleapis.com/$discovery/rest?version=v4',
        'scopes': ['https://www.googleapis.com/auth/spreadsheets.readonly']
    }];


function sheetToObject(sheet) {
    // take a table's first header row and use it as object property names
    const rowData = sheet.data[0].rowData,
        result = [];
    for (let rowNum = 1; rowNum < rowData.length; rowNum++) {
        let
            newRow = {},
            newRowHasData = false;

        for (let colNum = 0; rowData[rowNum] &&
        rowData[rowNum].values &&
        colNum < rowData[rowNum].values.length; colNum++) {
            let headerName = rowData[0].values[colNum].formattedValue.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
            if (rowData[rowNum].values[colNum] &&
                (typeof rowData[rowNum].values[colNum].formattedValue !== 'undefined')) {
                // Leave empty values missing, everything else is a string.
                newRow[headerName] = '' + rowData[rowNum].values[colNum].formattedValue;
                newRowHasData = true;
            }
        }
        if (newRowHasData) {
            result.push(newRow);
        }
    }
    return result;
}

async function main() {
    await auth.login(API_KEY, CLIENT_ID, APIS);
    const urlParams = new URLSearchParams(window.location.search);

    /** @type {boolean} */
    let someValue = true;
    if(urlParams.has('someValue')) {
        someValue = urlParams.get('someValue') === 'true';
    }
    console.info(`Set someValue=${someValue}`);

    /** @type {string} */
    const sheetId = location.hash.replace('#', '').replace(/[?&].*/, '');
    if (sheetId) {
        document.getElementById('sheet').setAttribute('href', `https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
    } else {
        document.getElementById('instructions-dialog').showModal();
        throw 'Missing sheetId after URL #';
    }

    console.log('readingSheet', sheetId);

    const resp = await gapi.client.sheets.spreadsheets.get({
        'spreadsheetId': sheetId,
        'includeGridData': true,
        // Gets excess data from other tabs, but removes a round trip.
        'fields': 'properties/title,sheets(properties(sheetId,title,gridProperties),data(rowData(values(formattedValue))))'
    });

    console.info('await gapi.client.sheets.spreadsheets.get:', resp);

    let spreadsheet = resp.result;
    console.info('spreadsheet', spreadsheet);
    document.getElementById('pageTitle').innerHTML = spreadsheet.properties.title;
    // console.log('Found ' + spreadsheet.sheets.length + ' worksheets.');

    const sheet = spreadsheet.sheets.find(sheet => sheet.properties.title.toLowerCase().includes('current'));

    if (!sheet) {
        throw 'Unable to find worksheet with "current" in the name.';
    }

    const rows = sheetToObject(sheet);
}

main().then(() => {
    console.info('Finished script.');
}).catch(err => {
    console.warn(err);
    alert(`App error: ${err}`);
});

