const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

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

const dataFilePath = path.join(__dirname, 'dados.json');

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

// Função para obter a data do último reset semanal (terça-feira às 12h)
function getLastWeeklyReset() {

  const now = new Date();
  const currentDay = now.getUTCDay(); 
  const currentHour = now.getUTCHours(); 

  let daysSinceTuesday = (currentDay + 7 - 2) % 7; 
  let lastReset = new Date(now);

  lastReset.setUTCDate(now.getUTCDate() - daysSinceTuesday);
  lastReset.setUTCHours(12, 0, 0, 0); 

  if (currentDay === 2 && currentHour < 12) {
    lastReset.setUTCDate(lastReset.getUTCDate() - 7);
  }
  return lastReset.getTime();
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
    // url = url.replace(
    //   'mythic-keystone-profile?',
    //   'mythic-keystone-profile/season/17?'
    // );
    const response = await axios.get(
      `${url}&locale=${locale}&access_token=${accessToken}`
    );
    // console.log(response.data)
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

app.get('/dados', (req, res) => {
  try {
    if (fs.existsSync(dataFilePath)) {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      res.json(data);
    } else {
      res.status(404).json({ error: 'Arquivo dados.json não encontrado.' });
    }
  } catch (error) {
    console.error('Erro ao ler dados.json:', error);
    res.status(500).json({ error: 'Erro ao ler dados.json.' });
  }
});

async function refreshData() {
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
          mythicPlusRating: [],
          greatVaultScore: [],
        };

        const slots = [
          'CHEST',
          'LEGS',
          'FEET',
          'WRIST',
          'FINGER_1',
          'FINGER_2',
          'BACK',
          'MAIN_HAND',
          'OFF_HAND',
        ];
        const characterEquipment = await getCharacterEquipment(
          accessToken,
          characterInfo.equipment.href
        );

        for (const item of characterEquipment.equipped_items) {
          characterData.allItems.push({
            slot: item.slot.type,
            level: item.level.display_string,
          });

          // Verificação de Tier Set
          if (item.set) {
            characterData.tierSet.push({
              slot: item.slot.type,
              level: item.level.display_string,
            });
          }

          // Verificar se o item é embelezado
          if (
            item.limit_category &&
            item.limit_category.includes('Unique-Equipped: Embellished (2)')
          ) {
            const spellsDescription = item.spells
              ? item.spells.map((spell) => spell.description)
              : [];
            characterData.embellishedItems.push({
              slot: item.slot.type,
              level: item.level.display_string,
              spells: spellsDescription,
            });
          }

          // Verificação de itens encantados
          if (slots.includes(item.slot.type)) {
            if (
              item.inventory_type.type !== 'SHIELD' &&
              item.inventory_type.type !== 'HOLDABLE'
            ) {
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
            const socketed = item.sockets.some((socket) => socket.item);
            characterData.sockets.push({
              slot: item.slot.type,
              level: item.level.display_string,
              sockets: item.sockets.map((socket) => ({
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
        
        if (mythicPlusData && mythicPlusData.current_period && mythicPlusData.current_period.best_runs) {

          characterData.mythicPlusRating.push(mythicPlusData.current_mythic_rating.rating);

          const lastResetTimestamp = getLastWeeklyReset(); // Obter o timestamp do último reset semanal
          const bestRuns = mythicPlusData.current_period.best_runs;
        
          let completedThisWeek = 0;
          characterData.mythicDungeons = [];
        
          // Itera sobre as dungeons feitas
          for (const run of bestRuns) {
            // Verifica se a dungeon foi completada após o reset semanal
            const isThisWeek = run.completed_timestamp >= lastResetTimestamp;
        
            if (isThisWeek) {
              completedThisWeek++;
            }
        
            // Adiciona os dados da dungeon ao array characterData.mythicDungeons
            characterData.mythicDungeons.push({
              name: run.dungeon.name,
              thisWeek: isThisWeek,  // Indica se a dungeon foi feita essa semana
              keystoneLevel: run.keystone_level,  // Nível da chave para referência
              isCompletedInTime: run.is_completed_within_time,  // Se foi completada dentro do tempo
              duration: run.duration,  // Duração da dungeon
              mythicRating: run.mythic_rating ? run.mythic_rating.rating : null  // Nota da Mythic Plus
            });
          }
      
        }
        
        // const greatVaultData = await getGreatVault(
        //   accessToken,
        //   characterInfo.mythic_keystone_profile.href
        // );

        // if (greatVaultData && greatVaultData.rewards) {
        //   for (const reward of greatVaultData.rewards) {
        //     characterData.greatVaultScore.push({
        //       slot: reward.slot.type,
        //       score: reward.level.display_string,
        //     });
        //   }
        // }

        result.push(characterData);
        // console.log(characterData);
      }
    }

    fs.writeFileSync(dataFilePath, JSON.stringify(result, null, 2), 'utf8');
  } catch (error) {
    console.error('Erro ao atualizar dados:', error);
  }
}

app.get('/', async (req, res) => {
  try {
    await refreshData();
    res.json({ message: 'Dados atualizados com sucesso!' });
  } catch (error) {
    console.error('Erro ao obter informações:', error);
    res.status(500).json({ error: 'Erro ao obter informações.' });
  }
});

// Configura o cron job para rodar a cada 6 horas
cron.schedule('0 */6 * * *', async () => {
  console.log('Iniciando atualização de dados programada...');
  await refreshData();
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
