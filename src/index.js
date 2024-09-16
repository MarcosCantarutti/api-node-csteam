const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

const realm = process.env.REALM;
const guildName = process.env.GUILD_NAME;
const region = process.env.REGION;
const locale = process.env.LOCALE;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

async function getBlizzardAccessToken(clientId, clientSecret) {
  const url = `https://${region}.battle.net/oauth/token`;
  const headers = {
    Authorization:
      'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const postFields = new URLSearchParams({
    grant_type: 'client_credentials',
  }).toString();

  try {
    const response = await axios.post(url, postFields, { headers });
    return response.data.access_token;
  } catch (error) {
    console.error(
      'Error getting access token:',
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getCharacterInfo(accessToken, url) {
  try {
    const response = await axios.get(
      `${url}&locale=${locale}&access_token=${accessToken}`
    );
    return response.data;
  } catch (error) {
    console.error(
      'Error getting character info:',
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getCharacterEquipment(accessToken, url) {
  try {
    const response = await axios.get(
      `${url}&locale=${locale}&access_token=${accessToken}`
    );
    return response.data;
  } catch (error) {
    console.error(
      'Error getting character equipment:',
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getGuildRoster(realm, guildName, accessToken) {
  const url = `https://${region}.api.blizzard.com/data/wow/guild/${realm}/${guildName}/roster?namespace=profile-${region}&locale=${locale}&access_token=${accessToken}`;

  try {
    const response = await axios.get(url);
    const filteredMembers = response.data.members.filter(
      (member) => member.character.level >= 80 && member.rank <= 3
    );
    return filteredMembers;
  } catch (error) {
    console.error(
      'Error getting guild roster:',
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

async function getCharacterMythicPlus(accessToken, url) {
  try {
    const response = await axios.get(
      `${url}&locale=${locale}&access_token=${accessToken}`
    );
    return response.data;
  } catch (error) {
    console.error(
      'Error getting character Mythic Plus data:',
      error.response ? error.response.data : error.message
    );
  }
}

async function getGreatVault(accessToken, url) {
  try {
    url = url.replace('mythic-keystone-profile?', 'mythic-keystone-profile/season/1/rewards?');
    const response = await axios.get(
      `${url}&locale=${locale}&access_token=${accessToken}`
    );
    return response.data;
  } catch (error) {
    console.error(
      'Error getting Great Vault data:',
      error.response ? error.response.data : error.message
    );
  }
}

app.get('/guild-info', async (req, res) => {
  try {
    const accessToken = await getBlizzardAccessToken(clientId, clientSecret);
    const guildRoster = await getGuildRoster(realm, guildName, accessToken);

    let result = '';
    const mockFilePath = path.join(__dirname, 'mockData.json');

    fs.writeFileSync(mockFilePath, '[]', 'utf8');

    for (const member of guildRoster) {
      if (member.character.level >= 80 && member.rank <= 3) {
        const characterName = member.character.name;
        const characterHref = member.character.key.href;

        const currentMockData = JSON.parse(
          fs.readFileSync(mockFilePath, 'utf8')
        );
        currentMockData.push({
          name: characterName,
          href: characterHref,
        });

        fs.writeFileSync(
          mockFilePath,
          JSON.stringify(currentMockData, null, 2),
          'utf8'
        );

        result += `Nome do Personagem: ${characterName}<br>`;
        result += `Link de Informações: ${characterHref}<br><br>`;
      }
    }

    res.send(result);
  } catch (error) {
    console.error('Erro ao obter informações da guilda:', error);
    res.status(500).send('Erro ao recuperar informações da guilda');
  }
});

async function getMockGuildRoster() {
  const mockFilePath = path.join(__dirname, 'mockData.json');

  try {
    if (!fs.existsSync(mockFilePath)) {
      throw new Error('Arquivo mockData.json não encontrado.');
    }

    const mockData = JSON.parse(fs.readFileSync(mockFilePath, 'utf8'));

    const mockRoster = mockData.map((character) => ({
      character: {
        name: character.name,
        key: { href: character.href },
        level: 80,
      },
      rank: 3,
    }));

    return mockRoster;
  } catch (error) {
    console.error('Erro ao obter o roster do mock:', error.message);
    throw error;
  }
}

app.get('/', async (req, res) => {
  try {
    const accessToken = await getBlizzardAccessToken(clientId, clientSecret);
    const guildRoster = await getMockGuildRoster();

    let result = [];

    for (const member of guildRoster) {
      if (member.character.level >= 80 && member.rank <= 3) {
        const characterName = member.character.name;
        const characterInfo = await getCharacterInfo(
          accessToken,
          member.character.key.href
        );

        let characterData = {
          name: characterInfo.name,
          level: characterInfo.level,
          race: characterInfo.race.name,
          class: characterInfo.character_class.name,
          itemLevel: {
            equipped: characterInfo.equipped_item_level,
            average: characterInfo.average_item_level,
          },
          tierSet: [],
          allItems: [],
          enchantedItems: [],
          sockets: [],
          embellishedItems: [],
          mythicDungeons: [],
          greatVaultScore: [],
          mythicPlusRating: [],
        };

        const slots = ['CHEST', 'LEGS', 'FEET', 'WRIST', 'FINGER_1', 'FINGER_2', 'BACK', 'MAIN_HAND', 'OFF_HAND'];
        const characterEquipment = await getCharacterEquipment(
          accessToken,
          characterInfo.equipment.href
        );

        for (const item of characterEquipment.equipped_items) {
          characterData.allItems.push({
            slot: item.slot.type,
            level: item.level.display_string
          });

          // console.log(item)

          // Verificação de Tier Set
          if (item.set) {
            characterData.tierSet.push({
              slot: item.slot.type,
              level: item.level.display_string
            });
          }


           // Verificar se o item é embelezado
          if (item.limit_category && item.limit_category.includes('Unique-Equipped: Embellished (2)')) {
            const spellsDescription = item.spells ? item.spells.map(spell => spell.description) : [];
            characterData.embellishedItems.push({
              slot: item.slot.type,
              level: item.level.display_string,
              spells: spellsDescription,
            });
          }


          // Verificação de itens encantados
          if (slots.includes(item.slot.type)) {
            if(item.inventory_type.type !== 'SHIELD' && item.inventory_type.type !=='HOLDABLE' ){
              // console.log(item.inventory_type.type)
              if (item.enchantments) {
                characterData.enchantedItems.push({
                  slot: item.slot.type,
                  level: item.level.display_string,
                  enchanted: true,
                });
              } else {
                characterData.enchantedItems.push({
                  slot: item.slot.type,
                  level: item.level.display_string,
                  enchanted: false,
                });
              }
            }
           
          }


         // Verificar se o item possui sockets e se está socketado
        if (item.sockets) {
          const socketed = item.sockets.some(socket => socket.item);
          characterData.sockets.push({
            slot: item.slot.type,
            level: item.level.display_string,
            sockets: item.sockets.map(socket => ({
              type: socket.socket_type,
              gem: socket.item ? socket.item.name : null,
            })),
            socketed: socketed,
          });
        }
        }

        // Mythic+ e Great Vault
        const mythicPlusData = await getCharacterMythicPlus(
          accessToken,
          characterInfo.mythic_keystone_profile.href
        );
        if (mythicPlusData && mythicPlusData.dungeons) {
          for (const dungeon of mythicPlusData.dungeons) {
            characterData.mythicDungeons.push({
              name: dungeon.name,
              thisWeek: dungeon.this_week,
            });
          }
        }

        const greatVaultData = await getGreatVault(
          accessToken,
          characterInfo.mythic_keystone_profile.href
        );
        if (greatVaultData && greatVaultData.rewards) {
          for (const reward of greatVaultData.rewards) {
            characterData.greatVaultScore.push({
              slot: reward.slot.type,
              score: reward.level.display_string,
            });
          }
        }

        // console.log(characterData)

        result.push(characterData);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Erro ao obter informações:', error);
    res.status(500).json({ error: 'Erro ao obter informações.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
