const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
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
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase  = createClient(supabaseUrl, supabaseKey);

let cachedPlayersData = null;
let lastFetchTime = 0;
const cacheDuration = 60 * 60 * 1000; // Cache por 1 hora (em milissegundos)

async function upsertPlayerData(playerData) {
  const createdAt = new Date().toISOString(); 
  const formattedCreatedAt = createdAt.replace('T', ' ').replace('Z', '');

  const { data, error } = await supabase
    .from('PLAYERS_JSON')
    .upsert([
      {
        id: playerData.id,
        created_at: formattedCreatedAt,
        player_data: playerData,
      }
    ], { onConflict: 'id' }); // Define que o conflito será resolvido pelo campo ID

  if (error) {
    console.error('Erro ao atualizar dados:', error.message);
    return;
  }

  console.log('Dados atualizados com sucesso para o player: ', playerData.name );
}


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
      (member) => member.character.level >= 80 && member.rank <= 2
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

async function getDungeonsDoneWithId(characterId) {
  const now = new Date();
  const today = now.getUTCDay();

  let lastTuesday = new Date(now);
  lastTuesday.setUTCHours(12, 0, 0, 0); // Define a hora 12:00 em UTC
  
  // Calcula a data da última terça-feira
  if (today < 2 || (today === 2 && now.getUTCHours() < 12)) {
    lastTuesday.setUTCDate(now.getUTCDate() - (today + 5));
  } else {
    lastTuesday.setUTCDate(now.getUTCDate() - (today - 2));
  }

  lastTuesday.setHours(lastTuesday.getHours() - 3);

  let dungeonsId = [12916, 13334, 14979, 14883, 15093, 14971, 4950, 9354];
  let totalDungeonsThisWeek = 0;
  let totalDungeonsAllTime = 0;

  for (const dungeonId of dungeonsId) {
    const response = await fetch(`https://raider.io/api/characters/mythic-plus-runs?season=season-tww-1&characterId=${characterId}&dungeonId=${dungeonId}&role=all&specId=0&mode=scored&affixes=all&date=all`);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const runs = data.runs || []; // Garantir que runs é um array

    const dungeonsThisWeek = runs.filter(run => {
      const completedAt = new Date(run.summary.completed_at);
      completedAt.setHours(completedAt.getHours() - 3);

      // console.log('lastTuesday: ',lastTuesday);
      // console.log('completedAt: ',completedAt);
      totalDungeonsAllTime++;

      return completedAt >= lastTuesday;
    });

    totalDungeonsThisWeek += dungeonsThisWeek.length;
  }

  // console.log(totalDungeonsThisWeek);

  return {totalDungeonsAllTime: totalDungeonsAllTime, totalDungeonsThisWeek: totalDungeonsThisWeek};
}

async function getRaiderIoData(region, realm, name, fields){
  try {
    const response = await fetch(`https://raider.io/api/v1/characters/profile?region=${region}&realm=${realm}&name=${name}&fields=${fields}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Erro ao buscar dados do Raider.IO:', error);
  }
};

async function getGreatVault(accessToken, url) {
  try {
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
    let upsertData = [];

    for (const member of guildRoster) {
      if (member.character.level >= 80 && member.rank <= 2) {
        const characterID = member.character.id;
        const characterName = member.character.name;
        const chracterLevel = member.character.level;
        const characterRank = member.rank;
        const characterHref = member.character.key.href;

        upsertData.push({
          id: characterID,
          name: characterName,
          level: chracterLevel,
          rank: characterRank,
          href: characterHref,
          created_at: new Date().toISOString(), // Definindo a data de criação
        });

    
      }
    }

      // Upsert no Supabase
    const { data, error } = await supabase
      .from('ROSTER')
      .upsert(upsertData, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    // Montando a resposta
    const result = upsertData.map(member => {
      return `Nome do Personagem: ${member.name}<br>`;
    }).join('');

    res.send(result);
  } catch (error) {
    console.error('Erro ao obter informações da guilda:', error);
    res.status(500).send('Erro ao recuperar informações da guilda');
  }
});

async function getMockGuildRoster() {
  try {
    const { data, error } = await supabase
      .from('ROSTER')
      .select('*'); // Seleciona todos os dados da tabela ROSTER

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('Nenhum dado encontrado na tabela ROSTER.');
    }

    // Retorna o roster em formato compatível
    const mockRoster = data.map((character) => ({
      character: {
        id: character.id,
        name: character.name,
        key: { href: character.href },
        level: character.level,
        raider_io_id: character.raider_io_id
      },
      rank: character.rank,
    }));

    return mockRoster;
  } catch (error) {
    console.error('Erro ao obter o roster do mock:', error.message);
    throw error;
  }
}

app.get('/dados', async (req, res) => {
  try {
    const currentTime = Date.now();

    // Verificar se há dados em cache e se ainda são válidos
    if (cachedPlayersData && currentTime - lastFetchTime < cacheDuration) {
      return res.json(cachedPlayersData); // Retornar dados do cache
    }

    // Caso contrário, consultar o Supabase
    const { data, error } = await supabase
      .from('PLAYERS_JSON')
      .select('player_data');

    if (error) {
      throw error;
    }

    // Armazenar os dados no cache e atualizar o timestamp da última consulta
    cachedPlayersData = data.map(item => item.player_data);
    lastFetchTime = currentTime;

    res.json(cachedPlayersData);
  } catch (error) {
    console.error('Erro ao consultar o Supabase:', error);
    res.status(500).json({ error: 'Erro ao consultar o Supabase.' });
  }
});


async function refreshData() {
  try {
    const accessToken = await getBlizzardAccessToken(clientId, clientSecret);
    const guildRoster = await getMockGuildRoster();

    let result = [];

    for (const member of guildRoster) {
      if (member.character.level >= 80 && member.rank <= 2) {
        const characterName = member.character.name;
        const characterInfo = await getCharacterInfo(
          accessToken,
          member.character.key.href
        );
        const realm = characterInfo.realm.slug;

        let characterData = {
          id:member.character.id,
          rank:member.rank,
          href:member.character.key.href,
          name: characterInfo.name,
          level: characterInfo.level,
          race: characterInfo.race.name,
          class: characterInfo.character_class.name,
          itemLevel: {
            equipped: characterInfo.equipped_item_level,
            average: characterInfo.average_item_level,
          },
          raider_io_id:member.character.raider_io_id,
          mythicDungeonsDoneThisWeek: 0,
          mythicDungeonsDoneAlltime:0,
          tierSet: [],
          enchantedItems: [],
          sockets: [],
          embellishedItems: [],
          mythicDungeons: [],
          raidProgress: [],
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
        
        if (mythicPlusData.current_mythic_rating) {
          characterData.mythicPlusRating.push(mythicPlusData.current_mythic_rating.rating);
        }

        const getDungeonsDone = await getDungeonsDoneWithId(member.character.raider_io_id)

        if(getDungeonsDone.totalDungeonsThisWeek){
          characterData.mythicDungeonsDoneThisWeek = getDungeonsDone.totalDungeonsThisWeek
        }

        if(getDungeonsDone.totalDungeonsAllTime){
          characterData.mythicDungeonsDoneAlltime = getDungeonsDone.totalDungeonsAllTime
        }
        // const getRaiderIoMplusData = await getRaiderIoData('us', realm, characterName, 'mythic_plus_weekly_highest_level_runs');

        // if (getRaiderIoMplusData && getRaiderIoMplusData.mythic_plus_weekly_highest_level_runs) {
        //   characterData.mythicDungeons = getRaiderIoMplusData.mythic_plus_weekly_highest_level_runs;
        // }

        const getRaiderIoRaidData = await getRaiderIoData('us', realm, characterName, 'raid_progression');

        if (getRaiderIoRaidData && getRaiderIoRaidData.raid_progression) {
          characterData.raidProgress = getRaiderIoRaidData.raid_progression;
        }

        await upsertPlayerData(characterData);

      }
    }

     // Limpar cache após atualizar dados
     cachedPlayersData = null;
     lastFetchTime = 0; 

    console.log('Finalizado com sucesso!');
  } catch (error) {
    console.error('Erro ao atualizar dados:', error);
  }
}

app.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    await refreshData();
    res.json({ message: 'Dados atualizados com sucesso!' });
  } catch (error) {
    console.error('Erro ao obter informações:', error);
    res.status(500).json({ error: 'Erro ao obter informações.' });
  }
});

// Configura o cron job para rodar a cada 1 horas
cron.schedule('0 */1 * * *', async () => {
  console.log('Iniciando atualização de dados programada...');
  await refreshData();
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});