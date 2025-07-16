import { chromium, Browser } from 'playwright';
import { expect } from "playwright/test";
import * as dotenv from 'dotenv';
dotenv.config();

let browser: Browser | undefined;

(async () => {
    async function main(cuit: string, password: string) {
        browser = await chromium.launch({
            headless: false, 
            slowMo: 50,
        });
        const page = await browser.newPage();

        // 1. Navigate to your login page
        await page.goto("https://auth.afip.gob.ar/contribuyente_/login.xhtml");

        // 2. Enter the username in the corresponding field
        // Use the CSS selector or XPath for your username field.
        await page.fill("#F1\\:username", cuit);

        // 3. Click the button to advance to the next step (which verifies the user and shows the password field)
        // It's crucial to wait for the navigation or the appearance of a new element
        // that indicates the second HTML (for the password) has loaded.
        // You could wait for a URL change if there's a redirect,
        // or more commonly, wait for the password field to become visible.

        console.log("Haciendo clic en el botón para verificar usuario...");
        // Option A: If clicking the button does not change the URL but loads new content dynamically
        // Wait for the password field to appear.
        const passwordFieldSelector = "#F1\\:password";

        await Promise.all([
            // Wait for the password field to be visible after the click
            page.waitForSelector(passwordFieldSelector, { state: 'visible' }),
            // Click the button that verifies the user
            page.click("#F1\\:btnSiguiente"),
        ]);

        console.log("Campo de contraseña visible. Ingresando contraseña...");
        // 4. Enter the password in the new field that appeared
        await page.fill(passwordFieldSelector, password);

        // 5. Click the final login button
        // This is the button that actually sends the password and logs you in.
        console.log("Haciendo clic en el botón de login final...");
        await page.click("#F1\\:btnIngresar");

        // Optional: Verify that the login was successful
        // For example, by waiting for a specific URL or an element on the destination page.
        await expect(page).toHaveURL("https://portalcf.cloud.afip.gob.ar/portal/app/");
        await expect(page.getByText('Estado de cuenta')).toBeVisible();

        const buscadorSelector = "#buscadorInput";
        await expect(page.locator(buscadorSelector)).toBeVisible();

        await page.fill(buscadorSelector, "Mis Comprobantes"); 
        
        await page.waitForSelector("#rbt-menu-item-0", { state: 'visible' });
        const misComprobantesLink = page.locator("#rbt-menu-item-0 a");
        await expect(misComprobantesLink).toBeVisible();

        const popupPage = page.waitForEvent('popup', async (popupPage) => {
            // Wait for the popup to load completely
            await popupPage.waitForLoadState('networkidle');

            console.log("Popup cargado correctamente.");

            const btnEmitidosSelector = "#btnEmitidos";
            await expect(popupPage.locator(btnEmitidosSelector)).toBeVisible();
            await popupPage.locator(btnEmitidosSelector).click();

            // Select the date range
            const dateInputId = "#fechaEmision";
            await expect(popupPage.locator(dateInputId)).toBeVisible();

            // Date of the first day of the CURRENT month
            const primerDia = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

            // Date of the last day of the CURRENT month
            const ultimoDia = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

            // Range for the current month (first day - last day) with format YYYY-MM-DD
            const rangoFecha = primerDia.toISOString().substring(0, 10) + " - " + ultimoDia.toISOString().substring(0, 10);
            await popupPage.fill(dateInputId, rangoFecha);

            // Click the search button
            const searchButtonId = "#buscarComprobantes";
            await expect(popupPage.locator(searchButtonId)).toBeVisible();
            await popupPage.click(searchButtonId);

            await popupPage.waitForLoadState('networkidle');

            // Wait until the results tab has the 'active' class
            const resultTabSelector = "#containerTabResultados";
            await expect(popupPage.locator(resultTabSelector)).toBeVisible();
            await expect(popupPage.locator(resultTabSelector)).toHaveClass(/active/); // Using regex for contains

            // If everything goes well, download the CSV file. It's a button with title="Exportar como CSV" inside the div with id #tablaDataTables_wrapper
            const downloadPromise = popupPage.waitForEvent('download');
            const downloadButtonSelector = '#tablaDataTables_wrapper button[title="Exportar como CSV"]';
            await expect(popupPage.locator(downloadButtonSelector)).toBeVisible();
            
            await popupPage.locator(downloadButtonSelector).click(); // Click once to trigger the download
            const download = await downloadPromise;

            // Save the CSV file
            const downloadPath = await download.path();
            await download.saveAs(`./${download.suggestedFilename()}`);
            console.log(`Archivo descargado: ${downloadPath}`);

            return true;
        });

        await misComprobantesLink.click();
        await popupPage;
    }

    if (!process.env.AFIP_USERNAME || !process.env.AFIP_PASSWORD) 
        throw new Error("AFIP_ISSUER_CUIT and AFIP_ISSUER_PASSWORD must be set");

    const cuit = process.env.AFIP_USERNAME;
    const password = process.env.AFIP_PASSWORD;

    await main(cuit, password);
})().catch(error => {
    console.error("Error in main function:", error);
}).finally(async () => {
    await browser?.close();
});