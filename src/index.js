require('dotenv').config(); // Carrega variáveis do .env para process.env

const express = require('express');
const axios = require('axios');
const app = express();

// Use variáveis de ambiente
const realm = process.env.REALM;
const guildName = process.env.GUILD_NAME;
const region = process.env.REGION;
const locale = process.env.LOCALE;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const port = process.env.PORT || 3000;

// Função para obter o token de acesso da Blizzard
async function getBlizzardAccessToken(clientId, clientSecret) {
    const url = `https://${region}.battle.net/oauth/token`;
    const response = await axios.post(url, new URLSearchParams({
        grant_type: 'client_credentials'
    }), {
        headers: {
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        }
    });

    return response.data.access_token;
}

// Função para obter o roster da guilda
async function getGuildRoster(realm, guildName, accessToken) {
    const url = `https://${region}.api.blizzard.com/data/wow/guild/${realm}/${guildName}/roster?namespace=profile-${region}&locale=${locale}&access_token=${accessToken}`;
    const response = await axios.get(url);
    return response.data;
}

app.get('/guild-info', async (req, res) => {
    try {
        const accessToken = await getBlizzardAccessToken(clientId, clientSecret);
        const guildRoster = await getGuildRoster(realm, guildName, accessToken);

        let result = '';

        for (const member of guildRoster.members) {
            if (member.character.level >= 80 && member.rank <= 3) {
                const characterName = member.character.name;
                // Adicione outras funções e lógica conforme necessário
                result += `Nome do Personagem: ${characterName}<br>`;
                // Exemplo de uso simplificado
            }
        }

        res.send(result);
    } catch (error) {
        console.error('Erro ao obter informações da guilda:', error);
        res.status(500).send('Erro ao recuperar informações da guilda');
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
