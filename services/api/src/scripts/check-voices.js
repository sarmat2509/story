const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://kazka:devpass@localhost:5432/kazka_dev' 
});

async function checkVoices() {
  await client.connect();
  
  try {
    const result = await client.query(
      "SELECT id, name, gender, language FROM tts_voices WHERE language = 'uk' AND is_active = true LIMIT 5;"
    );
    
    console.log('📢 Голоси в базі даних:');
    console.log('Кількість:', result.rows.length);
    
    if (result.rows.length === 0) {
      console.log('❌ Немає голосів! Потрібно запустити seed скрипт.');
    } else {
      result.rows.forEach(row => {
        console.log(` - ${row.name} (${row.gender}, ${row.language})`);
      });
    }
  } finally {
    await client.end();
  }
}

checkVoices().catch(console.error);
