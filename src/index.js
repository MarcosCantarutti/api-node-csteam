const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors'); // Importar o pacote CORS

// Carregar vari�veis de ambiente do arquivo .env
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// const allowedOrigins = ['http://localhost:5173', 'https://csteamraid.vercel.app/'];

// app.use(cors({
//     origin: (origin, callback) => {
//         if (!origin || allowedOrigins.includes(origin)) {
//             callback(null, true);
//         } else {
//             callback(new Error('Not allowed by CORS'));
//         }
//     }
// }));

// Configura��es iniciais
const realm = process.env.REALM;
const guildName = process.env.GUILD_NAME;
const region = process.env.REGION;
const locale = process.env.LOCALE;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

// Fun��o para obter o token de acesso da Blizzard
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

// Fun��o para obter informa��es do personagem
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

// Fun��o para obter equipamentos do personagem
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

// Fun��o para obter o roster da guilda
// Fun��o para obter o roster da guilda com filtragem de n�vel e rank
async function getGuildRoster(realm, guildName, accessToken) {
  const url = `https://${region}.api.blizzard.com/data/wow/guild/${realm}/${guildName}/roster?namespace=profile-${region}&locale=${locale}&access_token=${accessToken}`;

  try {
    const response = await axios.get(url);

    // Filtrando os membros com n�vel >= 80 e rank <= 3
    const filteredMembers = response.data.members.filter(
      (member) => member.character.level >= 80 && member.rank <= 3
    );

    console.log('filtered ', filteredMembers);
    return filteredMembers;
  } catch (error) {
    console.error(
      'Error getting guild roster:',
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

// Fun��o para obter dados do Mythic Plus do personagem
async function getCharacterMythicPlus(accessToken, url) {
  try {
    const response = await axios.get(
      `${url}/mythic-plus&locale=${locale}&access_token=${accessToken}`
    );
    return response.data;
  } catch (error) {
    console.error(
      'Error getting character Mythic Plus data:',
      error.response ? error.response.data : error.message
    );
    // throw error;
  }
}

// Fun��o para obter dados do Great Vault
async function getGreatVault(accessToken, url) {
  try {
    const response = await axios.get(
      `${url}/great-vault&locale=${locale}&access_token=${accessToken}`
    );
    return response.data;
  } catch (error) {
    console.error(
      'Error getting Great Vault data:',
      error.response ? error.response.data : error.message
    );
    // throw error;
  }
}

// Endpoint para obter e exibir as informa��es da guilda
const fs = require('fs');
const path = require('path');

app.get('/guild-info', async (req, res) => {
  try {
    console.log('Iniciando a obtenção do token de acesso...');
    const accessToken = await getBlizzardAccessToken(clientId, clientSecret);
    console.log('Token de acesso obtido:', accessToken);

    console.log('Obtendo o roster da guilda...');
    const guildRoster = await getGuildRoster(realm, guildName, accessToken);
    console.log('Roster da guilda obtido:', guildRoster);

    let result = '';
    const mockFilePath = path.join(__dirname, 'mockData.json');

    // Zerar o arquivo antes de começar o loop
    fs.writeFileSync(mockFilePath, '[]', 'utf8');
    console.log(`Arquivo ${mockFilePath} foi zerado.`);

    for (const member of guildRoster) {
      if (member.character.level >= 80 && member.rank <= 3) {
        const characterName = member.character.name;
        const characterHref = member.character.key.href;

        console.log(`Obtendo informações do personagem: ${characterName}`);

        // Atualiza o arquivo com o nome e href do personagem
        const currentMockData = JSON.parse(
          fs.readFileSync(mockFilePath, 'utf8')
        );
        currentMockData.push({
          name: characterName,
          href: characterHref,
        });

        // Grava os dados atualizados no arquivo
        fs.writeFileSync(
          mockFilePath,
          JSON.stringify(currentMockData, null, 2),
          'utf8'
        );
        console.log(
          `Dados do personagem ${characterName} foram gravados no mockData.json.`
        );

        // Apenas exibe no resultado para o cliente
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

// Função para obter o roster da guilda a partir do mockData.json
// Função para obter o roster da guilda a partir do mockData.json
async function getMockGuildRoster() {
  const mockFilePath = path.join(__dirname, 'mockData.json');

  try {
    // Verifica se o arquivo mockData.json existe
    if (!fs.existsSync(mockFilePath)) {
      throw new Error('Arquivo mockData.json não encontrado.');
    }

    // Lê e parseia o conteúdo do arquivo mockData.json
    const mockData = JSON.parse(fs.readFileSync(mockFilePath, 'utf8'));

    // Simula o formato de retorno como a API original
    const mockRoster = mockData.map((character) => ({
      character: {
        name: character.name,
        key: { href: character.href },
        level: 80, // Nível simulado, já que não temos o real no mock
      },
      rank: 3, // Rank simulado
    }));

    return mockRoster;
  } catch (error) {
    console.error('Erro ao obter o roster do mock:', error.message);
    throw error;
  }
}

app.get('/', async (req, res) => {
  try {
    console.log('Iniciando a obten��o do token de acesso...');
    const accessToken = await getBlizzardAccessToken(clientId, clientSecret);
    console.log('Token de acesso obtido:', accessToken);

    console.log('Obtendo o roster da guilda...');
    // const guildRoster = await getGuildRoster(realm, guildName, accessToken);
    // console.log('Roster da guilda obtido:', guildRoster);

    const guildRoster = await getMockGuildRoster();

    let result = [];

    for (const member of guildRoster) {
      if (member.character.level >= 80 && member.rank <= 3) {
        const characterName = member.character.name;
        console.log(`Obtendo informa��es do personagem: ${characterName}`);
        const characterInfo = await getCharacterInfo(
          accessToken,
          member.character.key.href
        );
        console.log('Informa��es do personagem:', characterInfo);

        // Objeto de dados do personagem
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
          mythicDungeons: [],
          greatVaultScore: [],
          mythicPlusRating: [],
        };

        // Tier Set
        console.log('Obtendo equipamentos do personagem...');
        const characterEquipment = await getCharacterEquipment(
          accessToken,
          characterInfo.equipment.href
        );
        for (const item of characterEquipment.equipped_items) {
          if (item.set) {
            characterData.tierSet.push({
              slot: item.slot.type,
              level: item.level.display_string,
            });
          }
        }

        // Mythic Plus
        console.log('Obtendo dados do Mythic Plus...');
        const mythicPlusData = await getCharacterMythicPlus(
          accessToken,
          characterInfo.equipment.href
        );
        if (mythicPlusData && mythicPlusData.dungeons) {
          for (const dungeon of mythicPlusData.dungeons) {
            characterData.mythicDungeons.push({
              name: dungeon.name,
              thisWeek: dungeon.this_week,
            });
          }
        }

        // Great Vault
        console.log('Obtendo dados do Great Vault...');
        const greatVaultData = await getGreatVault(
          accessToken,
          characterInfo.equipment.href
        );
        if (greatVaultData && greatVaultData.rewards) {
          for (const reward of greatVaultData.rewards) {
            characterData.greatVaultScore.push({
              name: reward.name,
              thisWeek: reward.this_week,
            });
          }
        }

        // Mythic+ Rating
        if (mythicPlusData && mythicPlusData.ratings) {
          for (const rating of mythicPlusData.ratings) {
            characterData.mythicPlusRating.push({
              name: rating.name,
              rating: rating.rating,
            });
          }
        }

        result.push(characterData);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Erro ao obter informa��es da guilda:', error);
    res.status(500).json({ error: 'Erro ao recuperar informa��es da guilda' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
