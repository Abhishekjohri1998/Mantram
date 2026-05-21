import fetch from 'node-fetch';

/**
 * Helper to call Shopify GraphQL Admin API
 */
async function shopifyGraphQL(shopDomain, accessToken, query, variables = {}) {
    const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const isLocal = cleanDomain.includes('localhost') || cleanDomain.includes('127.0.0.1');
    const url = `${isLocal ? 'http' : 'https'}://${cleanDomain}/admin/api/2025-01/graphql.json`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`Shopify GraphQL HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.errors) {
        throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
}

/**
 * Creates a recurring application charge (Subscription)
 * @param {string} shopDomain Shop domain
 * @param {string} accessToken Access token
 * @param {string} planName Plan name
 * @param {number} price Price in USD
 * @param {string} interval billing cycle ('monthly' or 'yearly')
 * @param {string} returnUrl URL to return to after approval/decline
 * @param {number} [trialDays=0] Free trial days
 * @returns {Promise<{confirmationUrl: string, chargeId: string}>}
 */
export async function createRecurringCharge({ shopDomain, accessToken, planName, price, interval, returnUrl, trialDays = 0 }) {
    const query = `
        mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: String!, $trialDays: Int, $test: Boolean) {
            appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, trialDays: $trialDays, test: $test) {
                appSubscription {
                    id
                    status
                }
                confirmationUrl
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    const isTest = process.env.NODE_ENV !== 'production';
    const shopifyInterval = interval === 'yearly' ? 'ANNUAL' : 'EVERY_30_DAYS';

    const variables = {
        name: planName,
        returnUrl,
        trialDays: trialDays > 0 ? trialDays : null,
        test: isTest,
        lineItems: [{
            plan: {
                appRecurringPricingDetails: {
                    price: {
                        amount: parseFloat(price).toFixed(2),
                        currencyCode: 'USD'
                    },
                    interval: shopifyInterval
                }
            }
        }]
    };

    const result = await shopifyGraphQL(shopDomain, accessToken, query, variables);
    const { appSubscriptionCreate } = result;

    if (appSubscriptionCreate.userErrors && appSubscriptionCreate.userErrors.length > 0) {
        throw new Error(`Shopify Billing Error: ${appSubscriptionCreate.userErrors.map(e => e.message).join(', ')}`);
    }

    return {
        confirmationUrl: appSubscriptionCreate.confirmationUrl,
        chargeId: appSubscriptionCreate.appSubscription.id
    };
}

/**
 * Creates a one-time application charge (Credit top-up)
 * @param {string} shopDomain Shop domain
 * @param {string} accessToken Access token
 * @param {string} packName Pack name
 * @param {number} price Price in USD
 * @param {string} returnUrl URL to return to after approval/decline
 * @returns {Promise<{confirmationUrl: string, chargeId: string}>}
 */
export async function createOneTimeCharge({ shopDomain, accessToken, packName, price, returnUrl }) {
    const query = `
        mutation appPurchaseOneTimeCreate($name: String!, $price: MoneyInput!, $returnUrl: String!, $test: Boolean) {
            appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
                appPurchaseOneTime {
                    id
                    status
                }
                confirmationUrl
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    const isTest = process.env.NODE_ENV !== 'production';

    const variables = {
        name: packName,
        price: {
            amount: parseFloat(price).toFixed(2),
            currencyCode: 'USD'
        },
        returnUrl,
        test: isTest
    };

    const result = await shopifyGraphQL(shopDomain, accessToken, query, variables);
    const { appPurchaseOneTimeCreate } = result;

    if (appPurchaseOneTimeCreate.userErrors && appPurchaseOneTimeCreate.userErrors.length > 0) {
        throw new Error(`Shopify Billing Error: ${appPurchaseOneTimeCreate.userErrors.map(e => e.message).join(', ')}`);
    }

    return {
        confirmationUrl: appPurchaseOneTimeCreate.confirmationUrl,
        chargeId: appPurchaseOneTimeCreate.appPurchaseOneTime.id
    };
}

/**
 * Gets the status/details of a recurring subscription charge
 * @param {string} shopDomain Shop domain
 * @param {string} accessToken Access token
 * @param {string} subscriptionId Subscription ID (gid://shopify/AppSubscription/...)
 */
export async function getSubscriptionDetails(shopDomain, accessToken, subscriptionId) {
    const query = `
        query getSubscription($id: ID!) {
            node(id: $id) {
                ... on AppSubscription {
                    id
                    name
                    status
                    createdAt
                    currentPeriodEnd
                    test
                    lineItems {
                        id
                        plan {
                            ... on AppRecurringPricing {
                                price {
                                    amount
                                    currencyCode
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    const result = await shopifyGraphQL(shopDomain, accessToken, query, { id: subscriptionId });
    return result.node;
}

/**
 * Gets the status/details of a one-time charge
 * @param {string} shopDomain Shop domain
 * @param {string} accessToken Access token
 * @param {string} chargeId Charge ID (gid://shopify/AppPurchaseOneTime/...)
 */
export async function getOneTimePurchaseDetails(shopDomain, accessToken, chargeId) {
    const query = `
        query getOneTimePurchase($id: ID!) {
            node(id: $id) {
                ... on AppPurchaseOneTime {
                    id
                    name
                    status
                    createdAt
                    price {
                        amount
                        currencyCode
                    }
                    test
                }
            }
        }
    `;

    const result = await shopifyGraphQL(shopDomain, accessToken, query, { id: chargeId });
    return result.node;
}
