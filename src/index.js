const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente do arquivo .env
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Configurações iniciais
const realm = process.env.REALM;
const guildName = process.env.GUILD_NAME;
const region = process.env.REGION;
const locale = process.env.LOCALE;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

// Função para obter o token de acesso da Blizzard
async function getBlizzardAccessToken(clientId, clientSecret) {
    const url = `https://${region}.battle.net/oauth/token`;
    const headers = {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    const postFields = new URLSearchParams({ 'grant_type': 'client_credentials' }).toString();

    try {
        const response = await axios.post(url, postFields, { headers });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Função para obter informações do personagem
async function getCharacterInfo(accessToken, url) {
    try {
        const response = await axios.get(`${url}&locale=${locale}&access_token=${accessToken}`);
        return response.data;
    } catch (error) {
        console.error('Error getting character info:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Função para obter equipamentos do personagem
async function getCharacterEquipment(accessToken, url) {
    try {
        const response = await axios.get(`${url}&locale=${locale}&access_token=${accessToken}`);
        return response.data;
    } catch (error) {
        console.error('Error getting character equipment:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Função para obter o roster da guilda
// Função para obter o roster da guilda com filtragem de nível e rank
async function getGuildRoster(realm, guildName, accessToken) {
    const url = `https://${region}.api.blizzard.com/data/wow/guild/${realm}/${guildName}/roster?namespace=profile-${region}&locale=${locale}&access_token=${accessToken}`;

    try {
        const response = await axios.get(url);

        // Filtrando os membros com nível >= 80 e rank <= 3
        const filteredMembers = response.data.members.filter(member => member.character.level >= 80 && member.rank <= 3);
        
        console.log("filtered ",filteredMembers)
        return filteredMembers;
    } catch (error) {
        console.error('Error getting guild roster:', error.response ? error.response.data : error.message);
        throw error;
    }
}


// Função para obter dados do Mythic Plus do personagem
async function getCharacterMythicPlus(accessToken, url) {
    try {
        const response = await axios.get(`${url}/mythic-plus&locale=${locale}&access_token=${accessToken}`);
        return response.data;
    } catch (error) {
        console.error('Error getting character Mythic Plus data:', error.response ? error.response.data : error.message);
        // throw error;
    }
}

// Função para obter dados do Great Vault
async function getGreatVault(accessToken, url) {
    try {
        const response = await axios.get(`${url}/great-vault&locale=${locale}&access_token=${accessToken}`);
        return response.data;
    } catch (error) {
        console.error('Error getting Great Vault data:', error.response ? error.response.data : error.message);
        // throw error;
    }
}

// Endpoint para obter e exibir as informações da guilda
app.get('/guild-info', async (req, res) => {
    try {
        console.log('Iniciando a obtenção do token de acesso...');
        const accessToken = await getBlizzardAccessToken(clientId, clientSecret);
        console.log('Token de acesso obtido:', accessToken);

        console.log('Obtendo o roster da guilda...');
        const guildRoster = await getGuildRoster(realm, guildName, accessToken);
        console.log('Roster da guilda obtido:', guildRoster);

        let result = '';

        for (const member of guildRoster) {
            if (member.character.level >= 80 && member.rank <= 3) {
                const characterName = member.character.name;
                console.log(`Obtendo informações do personagem: ${characterName}`);
                const characterInfo = await getCharacterInfo(accessToken, member.character.key.href);
                console.log('Informações do personagem:', characterInfo);

                result += `Nome do Personagem: ${characterInfo.name}<br>`;
                result += `Nível: ${characterInfo.level}<br>`;
                result += `Raça: ${characterInfo.race.name}<br>`;
                result += `Classe: ${characterInfo.character_class.name}<br>`;
                result += `Item Level: ${characterInfo.equipped_item_level} (Equipado) / ${characterInfo.average_item_level}<br>`;
                
                // Exibindo Tier Set
                console.log('Obtendo equipamentos do personagem...');
                const characterEquipment = await getCharacterEquipment(accessToken, characterInfo.equipment.href);
                result += 'Tier Set:<br>';
                for (const item of characterEquipment.equipped_items) {
                    if (item.set) {
                        result += `${item.slot.type} - ${item.level.display_string}<br>`;
                    }
                }

                // Dados do Mythic Plus e Great Vault
                console.log('Obtendo dados do Mythic Plus...');
                const mythicPlusData = await getCharacterMythicPlus(accessToken, characterInfo.equipment.href);
                result += '<br>Mythic Dungeons Done:<br>';
                if (mythicPlusData && mythicPlusData.dungeons) {
                    for (const dungeon of mythicPlusData.dungeons) {
                        result += `- ${dungeon.name} (This Week: ${dungeon.this_week})<br>`;
                    }
                }

                result += '<br>Great Vault Score:<br>';
                const greatVaultData = await getGreatVault(accessToken, characterInfo.equipment.href);
                if (greatVaultData && greatVaultData.rewards) {
                    for (const reward of greatVaultData.rewards) {
                        result += `- ${reward.name} (This Week: ${reward.this_week})<br>`;
                    }
                }

                result += '<br>Mythic+ Rating:<br>';
                if (mythicPlusData && mythicPlusData.ratings) {
                    for (const rating of mythicPlusData.ratings) {
                        result += `- ${rating.name} (Rating: ${rating.rating})<br>`;
                    }
                }
                result += '<br>';
            }
        }

        res.send(result);
    } catch (error) {
        console.error('Erro ao obter informações da guilda:', error);
        res.status(500).send('Erro ao recuperar informações da guilda');
    }
});



app.get('/', async (req, res) => {
    try {
        console.log('Iniciando a obtenção do token de acesso...');
        const accessToken = await getBlizzardAccessToken(clientId, clientSecret);
        console.log('Token de acesso obtido:', accessToken);

        console.log('Obtendo o roster da guilda...');
        const guildRoster = await getGuildRoster(realm, guildName, accessToken);
        console.log('Roster da guilda obtido:', guildRoster);

        let result = [];

        for (const member of guildRoster) {
            if (member.character.level >= 80 && member.rank <= 3) {
                const characterName = member.character.name;
                console.log(`Obtendo informações do personagem: ${characterName}`);
                const characterInfo = await getCharacterInfo(accessToken, member.character.key.href);
                console.log('Informações do personagem:', characterInfo);

                // Objeto de dados do personagem
                let characterData = {
                    name: characterInfo.name,
                    level: characterInfo.level,
                    race: characterInfo.race.name,
                    class: characterInfo.character_class.name,
                    itemLevel: {
                        equipped: characterInfo.equipped_item_level,
                        average: characterInfo.average_item_level
                    },
                    tierSet: [],
                    mythicDungeons: [],
                    greatVaultScore: [],
                    mythicPlusRating: []
                };

                // Tier Set
                console.log('Obtendo equipamentos do personagem...');
                const characterEquipment = await getCharacterEquipment(accessToken, characterInfo.equipment.href);
                for (const item of characterEquipment.equipped_items) {
                    if (item.set) {
                        characterData.tierSet.push({
                            slot: item.slot.type,
                            level: item.level.display_string
                        });
                    }
                }

                // Mythic Plus
                console.log('Obtendo dados do Mythic Plus...');
                const mythicPlusData = await getCharacterMythicPlus(accessToken, characterInfo.equipment.href);
                if (mythicPlusData && mythicPlusData.dungeons) {
                    for (const dungeon of mythicPlusData.dungeons) {
                        characterData.mythicDungeons.push({
                            name: dungeon.name,
                            thisWeek: dungeon.this_week
                        });
                    }
                }

                // Great Vault
                console.log('Obtendo dados do Great Vault...');
                const greatVaultData = await getGreatVault(accessToken, characterInfo.equipment.href);
                if (greatVaultData && greatVaultData.rewards) {
                    for (const reward of greatVaultData.rewards) {
                        characterData.greatVaultScore.push({
                            name: reward.name,
                            thisWeek: reward.this_week
                        });
                    }
                }

                // Mythic+ Rating
                if (mythicPlusData && mythicPlusData.ratings) {
                    for (const rating of mythicPlusData.ratings) {
                        characterData.mythicPlusRating.push({
                            name: rating.name,
                            rating: rating.rating
                        });
                    }
                }

                result.push(characterData);
            }
        }

        res.json(result);
    } catch (error) {
        console.error('Erro ao obter informações da guilda:', error);
        res.status(500).json({ error: 'Erro ao recuperar informações da guilda' });
    }
});



app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
