const xboxAPI = require("./xboxAPI");
const {
  Client,
  IntentsBitField,
  SlashCommandBuilder,
  Events,
  EnbedBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

const clientID = process.env.CLIENT_ID;
const guildID = process.env.GUILD_ID;

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

client.on("ready", (c) => {
  console.log("CLIENT READY");
  const test = new SlashCommandBuilder()
    .setName("test")
    .setDescription("This is the test command");

  const info = new SlashCommandBuilder()
    .setName("info")
    .setDescription("This is the info command");

  client.application.commands.create(test, guildID);
  client.application.commands.create(info, guildID);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) {
    return;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  await interaction.deferReply();
  if (interaction.commandName === "test") {
    const { gameClips } = await xla.getClipsForGamer("Cr1msonOmega");
    const res = await xla.getDetailsForClip(
      "Cr1msonOmega",
      gameClips[0].gameClipId
    );
    const embed = new EmbedBuilder();
    const attachment = new AttachmentBuilder();
    attachment.setFile(res.gameClipUris[0].uri);

    embed
      .setTitle("Cr1msonOmega Clip")
      .setDescription(`${res.titleName} - ${res.clipName}`)
      .setColor(0x18e1ee);
    //   .setThumbnail(res.thumbnails[1].uri)
    //   .setImage(
    //     ""
    //   )
    //   .addFields([
    //     {
    //       name: "Clip",
    //       value: res.gameClipUris[0].uri,
    //       inline: false,
    //     },
    //   ]);

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  } else if (interaction.commandName === "info") {
    const res = await xboxAPI.getProfile("SoupyHorizon541");
    const gt = res.find((x) => x.id === "Gamertag").value;
    const gameDisplayName = res.find((x) => x.id === "GameDisplayName").value;
    const gamerScore = res.find((x) => x.id === "Gamerscore").value;
    const thumbnail = res.find((x) => x.id === "GameDisplayPicRaw").value;
    const tier = res.find((x) => x.id === "AccountTier").value;
    const tenure = res.find((x) => x.id === "TenureLevel").value;
    const xuid = res.find((x) => x.id === "xuid").value;
    const { targetFollowingCount, targetFollowerCount } =
      await xboxAPI.getFriends(xuid);
    // const res2 = await xboxAPI.getUserPrecense(xuid);
    // console.log(res2);
    const embed = new EmbedBuilder();

    let profileInfo = "";
    profileInfo += `Gamertag: **${gt}**\n`;
    profileInfo += `Display Name: **${gameDisplayName}**\n`;
    profileInfo += `XUID: **${xuid}**\n`;
    profileInfo += `Gamerscore: **${gamerScore}**\n`;
    profileInfo += `Account Tier: **${tier}**\n`;
    profileInfo += `Tenure: **${tenure} Years**\n\n`;

    profileInfo += `Friends: **${targetFollowingCount}**\n`;
    profileInfo += `Followers: **${targetFollowerCount}**\n`;
    embed
      .setTitle("Account Check")
      .setColor(0x18e1ee)
      .addFields([
        {
          name: "Account Info",
          value: profileInfo,
        },
      ])
      .setThumbnail(thumbnail);
    await interaction.editReply({
      embeds: [embed],
    });
  }
});

client.login(process.env.CLIENT_TOKEN);
