/**
 * Ngan hang chu de luyen tieng Anh / IELTS.
 *
 * Du lieu tinh, khong goi API nao — chi la kho de topic-of-day.ts chon ra mot
 * bo theo tung ngay. Noi dung soan theo cau truc IELTS Speaking/Writing thuc te.
 */

export interface SpeakingTopic {
  id: string;
  theme: string;
  /** De bai Part 2 kieu "cue card". */
  cueCard: { title: string; points: string[] };
  /** Cau hoi thao luan Part 3, cung chu de voi cue card. */
  part3: string[];
}

export interface WritingTopic {
  id: string;
  type: 'Ý kiến cá nhân' | 'Thảo luận hai mặt' | 'Nguyên nhân — giải pháp' | 'Ưu và nhược điểm';
  prompt: string;
}

export interface VocabTheme {
  id: string;
  theme: string;
  words: Array<{ word: string; meaning: string }>;
}

export const SPEAKING_TOPICS: SpeakingTopic[] = [
  {
    id: 'travel',
    theme: 'Du lịch',
    cueCard: {
      title: 'Describe a memorable trip you have taken',
      points: ['Where you went', 'Who you went with', 'What you did there', 'Why it was memorable'],
    },
    part3: [
      'Why do people like to travel to other countries?',
      'How has tourism changed in your country in recent years?',
      'Do you think space tourism will become popular in the future?',
    ],
  },
  {
    id: 'technology',
    theme: 'Công nghệ',
    cueCard: {
      title: 'Describe a piece of technology you find useful',
      points: ['What it is', 'How often you use it', 'What you use it for', 'Why it is useful to you'],
    },
    part3: [
      'How has technology changed the way people communicate?',
      'What are the disadvantages of relying too much on technology?',
      'Do you think artificial intelligence will replace human jobs?',
    ],
  },
  {
    id: 'education',
    theme: 'Giáo dục',
    cueCard: {
      title: 'Describe a teacher who influenced you',
      points: ['Who this person was', 'What subject they taught', 'What was special about them', 'Why they influenced you'],
    },
    part3: [
      'What qualities should a good teacher have?',
      'Should students be allowed to choose their own subjects?',
      'Is online learning as effective as traditional classroom learning?',
    ],
  },
  {
    id: 'environment',
    theme: 'Môi trường',
    cueCard: {
      title: 'Describe an environmental problem in your area',
      points: ['What the problem is', 'What causes it', 'How it affects people', 'What could be done about it'],
    },
    part3: [
      'What can individuals do to protect the environment?',
      'Should governments punish companies that pollute?',
      'Do you think climate change is the biggest challenge of our time?',
    ],
  },
  {
    id: 'health',
    theme: 'Sức khoẻ',
    cueCard: {
      title: 'Describe a healthy habit you have',
      points: ['What the habit is', 'When you started it', 'How you maintain it', 'How it benefits you'],
    },
    part3: [
      'Why do many people find it hard to keep healthy habits?',
      'Should junk food advertising be restricted?',
      'How can governments encourage people to live healthier lives?',
    ],
  },
  {
    id: 'work',
    theme: 'Công việc',
    cueCard: {
      title: 'Describe a job you would like to do in the future',
      points: ['What the job is', 'What skills it requires', 'Why you would like it', 'How you would prepare for it'],
    },
    part3: [
      'Is it better to work for a large company or a small one?',
      'How has remote work changed people\'s work-life balance?',
      'Do you think job security is more important than a high salary?',
    ],
  },
  {
    id: 'family',
    theme: 'Gia đình',
    cueCard: {
      title: 'Describe a family member you are close to',
      points: ['Who this person is', 'How often you see them', 'What you do together', 'Why you are close to them'],
    },
    part3: [
      'How have family structures changed in recent decades?',
      'Should adult children live with their parents?',
      'What responsibilities do children have towards their parents?',
    ],
  },
  {
    id: 'hobbies',
    theme: 'Sở thích',
    cueCard: {
      title: 'Describe a hobby you enjoy in your free time',
      points: ['What the hobby is', 'When you started it', 'How you do it', 'Why you enjoy it'],
    },
    part3: [
      'Why do people need hobbies?',
      'Are traditional hobbies dying out because of technology?',
      'Should schools encourage students to have hobbies outside academics?',
    ],
  },
  {
    id: 'culture',
    theme: 'Văn hoá',
    cueCard: {
      title: 'Describe a cultural tradition in your country',
      points: ['What the tradition is', 'When it takes place', 'What people do during it', 'Why it is important'],
    },
    part3: [
      'How do traditions change as a country develops?',
      'Should traditional festivals be preserved even if they are costly?',
      'What can be lost when a country becomes more globalised?',
    ],
  },
  {
    id: 'city-life',
    theme: 'Cuộc sống thành thị',
    cueCard: {
      title: 'Describe a city you would like to live in',
      points: ['Which city it is', 'What it is known for', 'What you could do there', 'Why you would like to live there'],
    },
    part3: [
      'What are the advantages and disadvantages of living in a big city?',
      'How can cities reduce traffic congestion?',
      'Do you think cities will become more crowded in the future?',
    ],
  },
  {
    id: 'shopping',
    theme: 'Mua sắm',
    cueCard: {
      title: 'Describe something you bought that you were satisfied with',
      points: ['What you bought', 'Where you bought it', 'Why you bought it', 'Why you were satisfied with it'],
    },
    part3: [
      'How has online shopping changed the way people buy things?',
      'Do you think advertising influences people\'s buying decisions too much?',
      'Should there be limits on advertising aimed at children?',
    ],
  },
  {
    id: 'food',
    theme: 'Ẩm thực',
    cueCard: {
      title: 'Describe a meal you really enjoyed',
      points: ['What the meal was', 'Where you had it', 'Who you had it with', 'Why you enjoyed it'],
    },
    part3: [
      'How have eating habits changed in your country?',
      'Is it important for children to learn how to cook?',
      'Do you think fast food will remain popular in the future?',
    ],
  },
  {
    id: 'sports',
    theme: 'Thể thao',
    cueCard: {
      title: 'Describe a sport you like to watch or play',
      points: ['What the sport is', 'How you learned about it', 'How often you watch or play it', 'Why you like it'],
    },
    part3: [
      'Why do some sports become more popular than others?',
      'Should schools spend more money on sports facilities?',
      'Do professional athletes get paid too much money?',
    ],
  },
  {
    id: 'media',
    theme: 'Truyền thông',
    cueCard: {
      title: 'Describe a piece of news that interested you',
      points: ['What the news was', 'Where you heard about it', 'What happened', 'Why it interested you'],
    },
    part3: [
      'How has social media changed the way people get news?',
      'Can we trust the information we see online?',
      'Should there be stricter regulations on social media companies?',
    ],
  },
  {
    id: 'money',
    theme: 'Tiền bạc',
    cueCard: {
      title: 'Describe something you saved money to buy',
      points: ['What it was', 'How long it took to save', 'How you saved the money', 'How you felt when you bought it'],
    },
    part3: [
      'Should children be taught about money management at school?',
      'Do you think people today are more materialistic than in the past?',
      'What are the benefits of saving money regularly?',
    ],
  },
  {
    id: 'friendship',
    theme: 'Tình bạn',
    cueCard: {
      title: 'Describe a good friend of yours',
      points: ['Who this person is', 'How you met', 'What you do together', 'Why they are a good friend'],
    },
    part3: [
      'How do friendships change as people get older?',
      'Is it possible to maintain a friendship only online?',
      'What makes a good friendship last a long time?',
    ],
  },
  {
    id: 'reading',
    theme: 'Đọc sách',
    cueCard: {
      title: 'Describe a book that had a strong impact on you',
      points: ['What the book was about', 'When you read it', 'Why you chose to read it', 'How it impacted you'],
    },
    part3: [
      'Why do fewer young people read books nowadays?',
      'Are e-books better than printed books?',
      'Should reading be made compulsory in schools?',
    ],
  },
  {
    id: 'nature',
    theme: 'Thiên nhiên',
    cueCard: {
      title: 'Describe a natural place you have visited',
      points: ['Where it is', 'When you went there', 'What you saw', 'Why it was special'],
    },
    part3: [
      'Why is it important for people to spend time in nature?',
      'How can natural areas be protected from tourism damage?',
      'Do you think city dwellers are losing their connection with nature?',
    ],
  },
  {
    id: 'transport',
    theme: 'Giao thông',
    cueCard: {
      title: 'Describe a form of transport you often use',
      points: ['What it is', 'How often you use it', 'Where you usually go', 'Why you choose this transport'],
    },
    part3: [
      'What can be done to reduce traffic in big cities?',
      'Will public transport become more popular than private cars?',
      'Should governments invest more in electric vehicles?',
    ],
  },
  {
    id: 'festivals',
    theme: 'Lễ hội',
    cueCard: {
      title: 'Describe a festival that is important in your country',
      points: ['What festival it is', 'When it happens', 'How people celebrate it', 'Why it is important'],
    },
    part3: [
      'Why do festivals matter to a community?',
      'Are traditional festivals becoming too commercialised?',
      'Should companies give employees holidays for all festivals?',
    ],
  },
  {
    id: 'art',
    theme: 'Nghệ thuật',
    cueCard: {
      title: 'Describe a piece of art or music you like',
      points: ['What it is', 'Who created it', 'When you first experienced it', 'Why you like it'],
    },
    part3: [
      'Why is art important to a society?',
      'Should governments fund art and museums?',
      'How has technology changed the way people create and enjoy art?',
    ],
  },
  {
    id: 'weather',
    theme: 'Thời tiết',
    cueCard: {
      title: 'Describe your favourite type of weather',
      points: ['What the weather is like', 'When it usually happens', 'What you like to do in it', 'Why you like it'],
    },
    part3: [
      'How does weather affect people\'s moods and behaviour?',
      'Do you think weather patterns are changing because of climate change?',
      'How does weather affect a country\'s economy?',
    ],
  },
  {
    id: 'learning-language',
    theme: 'Học ngoại ngữ',
    cueCard: {
      title: 'Describe a foreign language you would like to learn',
      points: ['Which language it is', 'Why you want to learn it', 'How you would learn it', 'How it would be useful to you'],
    },
    part3: [
      'What is the best way to learn a new language?',
      'Should a second language be compulsory in schools?',
      'Will translation technology reduce the need to learn foreign languages?',
    ],
  },
  {
    id: 'housing',
    theme: 'Nhà ở',
    cueCard: {
      title: 'Describe the place where you live',
      points: ['Where it is', 'What it looks like', 'Who you live with', 'What you like or dislike about it'],
    },
    part3: [
      'What are the advantages of living in an apartment compared to a house?',
      'Why is housing becoming more expensive in many cities?',
      'How might homes change in the future?',
    ],
  },
];

export const WRITING_TOPICS: WritingTopic[] = [
  {
    id: 'w1',
    type: 'Ý kiến cá nhân',
    prompt:
      'Some people think that the best way to solve environmental problems is to increase the price of fuel. To what extent do you agree or disagree?',
  },
  {
    id: 'w2',
    type: 'Thảo luận hai mặt',
    prompt:
      'Some people believe that unpaid community service should be a compulsory part of high school programmes. Discuss both views and give your own opinion.',
  },
  {
    id: 'w3',
    type: 'Nguyên nhân — giải pháp',
    prompt: 'Many people struggle to balance work and family life. What are the causes of this problem and what solutions can you suggest?',
  },
  {
    id: 'w4',
    type: 'Ưu và nhược điểm',
    prompt: 'More and more people are choosing to work from home rather than commute to an office. What are the advantages and disadvantages of this trend?',
  },
  {
    id: 'w5',
    type: 'Ý kiến cá nhân',
    prompt: 'In many countries, the amount of crime committed by teenagers is increasing. What do you think are the causes of this, and what solutions can you suggest?',
  },
  {
    id: 'w6',
    type: 'Thảo luận hai mặt',
    prompt: 'Some people think that governments should focus on reducing environmental pollution, while others think this is the responsibility of individuals. Discuss both views and give your opinion.',
  },
  {
    id: 'w7',
    type: 'Ưu và nhược điểm',
    prompt: 'Nowadays, many students choose to study abroad. What are the benefits and drawbacks of this trend?',
  },
  {
    id: 'w8',
    type: 'Ý kiến cá nhân',
    prompt: 'Some people believe that it is best to accept a bad situation, while others think it is better to try to change such situations. Discuss both views and give your own opinion.',
  },
  {
    id: 'w9',
    type: 'Nguyên nhân — giải pháp',
    prompt: 'In many cities, traffic congestion is becoming a serious problem. What are the causes of this problem and what measures could be taken to solve it?',
  },
  {
    id: 'w10',
    type: 'Ưu và nhược điểm',
    prompt: 'Many companies now use social media to advertise their products. What are the advantages and disadvantages of this method of advertising?',
  },
  {
    id: 'w11',
    type: 'Ý kiến cá nhân',
    prompt: 'Some people think that children should begin learning a foreign language as soon as they start school. To what extent do you agree or disagree?',
  },
  {
    id: 'w12',
    type: 'Thảo luận hai mặt',
    prompt: 'Some people think museums should be enjoyable places, while others believe they should be educational. Discuss both views and give your own opinion.',
  },
  {
    id: 'w13',
    type: 'Nguyên nhân — giải pháp',
    prompt: 'Obesity among children is becoming a common problem in many countries. What are the causes of this, and what can be done to address it?',
  },
  {
    id: 'w14',
    type: 'Ưu và nhược điểm',
    prompt: 'An increasing number of people are choosing to live alone rather than with family or a partner. What are the advantages and disadvantages of this?',
  },
  {
    id: 'w15',
    type: 'Ý kiến cá nhân',
    prompt: 'Some people believe that competition at work and school brings more benefits than harm. To what extent do you agree or disagree?',
  },
  {
    id: 'w16',
    type: 'Thảo luận hai mặt',
    prompt: 'Some people think that the government should provide free healthcare for everyone, while others believe individuals should pay for their own medical costs. Discuss both views and give your opinion.',
  },
  {
    id: 'w17',
    type: 'Nguyên nhân — giải pháp',
    prompt: 'Many young people leave school unable to read and write well. Why is this the case, and what can be done to improve the situation?',
  },
  {
    id: 'w18',
    type: 'Ưu và nhược điểm',
    prompt: 'More people are using their smartphones to shop online instead of visiting physical stores. What are the advantages and disadvantages of this development?',
  },
  {
    id: 'w19',
    type: 'Ý kiến cá nhân',
    prompt: 'Some people think that all university students should study whatever they like, while others believe they should only be allowed to study subjects that will be useful in the future. Discuss both views and give your opinion.',
  },
  {
    id: 'w20',
    type: 'Nguyên nhân — giải pháp',
    prompt: 'In many countries, fewer people are choosing to work in agriculture. What are the reasons for this, and what could be done to encourage more people to work in this sector?',
  },
];

export const VOCAB_THEMES: VocabTheme[] = [
  {
    id: 'v-travel',
    theme: 'Du lịch',
    words: [
      { word: 'itinerary', meaning: 'lịch trình chuyến đi' },
      { word: 'off the beaten track', meaning: 'nơi ít người biết đến, hẻo lánh' },
      { word: 'breathtaking', meaning: 'ngoạn mục, đẹp đến sững sờ' },
      { word: 'layover', meaning: 'thời gian quá cảnh giữa hai chuyến bay' },
      { word: 'immerse oneself in', meaning: 'hoà mình vào (văn hoá, trải nghiệm)' },
      { word: 'budget-friendly', meaning: 'phù hợp túi tiền' },
    ],
  },
  {
    id: 'v-technology',
    theme: 'Công nghệ',
    words: [
      { word: 'cutting-edge', meaning: 'tiên tiến nhất, hiện đại nhất' },
      { word: 'streamline', meaning: 'tối ưu hoá, làm gọn quy trình' },
      { word: 'glitch', meaning: 'lỗi nhỏ, trục trặc kỹ thuật' },
      { word: 'user-friendly', meaning: 'dễ sử dụng' },
      { word: 'data breach', meaning: 'rò rỉ dữ liệu' },
      { word: 'obsolete', meaning: 'lỗi thời, đã lạc hậu' },
    ],
  },
  {
    id: 'v-education',
    theme: 'Giáo dục',
    words: [
      { word: 'curriculum', meaning: 'chương trình giảng dạy' },
      { word: 'rote learning', meaning: 'học vẹt, học thuộc lòng' },
      { word: 'extracurricular', meaning: 'ngoại khoá' },
      { word: 'literacy', meaning: 'khả năng đọc viết' },
      { word: 'academic pressure', meaning: 'áp lực học tập' },
      { word: 'well-rounded', meaning: 'phát triển toàn diện' },
    ],
  },
  {
    id: 'v-environment',
    theme: 'Môi trường',
    words: [
      { word: 'greenhouse gas', meaning: 'khí nhà kính' },
      { word: 'deforestation', meaning: 'phá rừng' },
      { word: 'renewable energy', meaning: 'năng lượng tái tạo' },
      { word: 'carbon footprint', meaning: 'lượng khí thải carbon' },
      { word: 'biodiversity', meaning: 'đa dạng sinh học' },
      { word: 'sustainable', meaning: 'bền vững' },
    ],
  },
  {
    id: 'v-health',
    theme: 'Sức khoẻ',
    words: [
      { word: 'sedentary lifestyle', meaning: 'lối sống ít vận động' },
      { word: 'well-being', meaning: 'sự khoẻ mạnh, hạnh phúc' },
      { word: 'chronic illness', meaning: 'bệnh mãn tính' },
      { word: 'immune system', meaning: 'hệ miễn dịch' },
      { word: 'burnout', meaning: 'kiệt sức, cạn năng lượng' },
      { word: 'nutritious', meaning: 'giàu dinh dưỡng' },
    ],
  },
  {
    id: 'v-work',
    theme: 'Công việc',
    words: [
      { word: 'work-life balance', meaning: 'cân bằng công việc — cuộc sống' },
      { word: 'job security', meaning: 'sự ổn định trong công việc' },
      { word: 'workload', meaning: 'khối lượng công việc' },
      { word: 'career progression', meaning: 'sự thăng tiến sự nghiệp' },
      { word: 'redundancy', meaning: 'bị sa thải do dư thừa nhân sự' },
      { word: 'freelance', meaning: 'làm việc tự do' },
    ],
  },
  {
    id: 'v-city',
    theme: 'Cuộc sống thành thị',
    words: [
      { word: 'urbanisation', meaning: 'đô thị hoá' },
      { word: 'congestion', meaning: 'tắc nghẽn (giao thông)' },
      { word: 'high-rise', meaning: 'toà nhà cao tầng' },
      { word: 'public amenities', meaning: 'tiện ích công cộng' },
      { word: 'cost of living', meaning: 'chi phí sinh hoạt' },
      { word: 'gentrification', meaning: 'quá trình đô thị hoá làm giá nhà tăng, đẩy dân cư cũ đi' },
    ],
  },
  {
    id: 'v-money',
    theme: 'Tiền bạc',
    words: [
      { word: 'disposable income', meaning: 'thu nhập khả dụng' },
      { word: 'materialistic', meaning: 'trọng vật chất' },
      { word: 'frugal', meaning: 'tiết kiệm, chi tiêu dè sẻn' },
      { word: 'financial literacy', meaning: 'hiểu biết tài chính' },
      { word: 'in debt', meaning: 'nợ nần' },
      { word: 'invest', meaning: 'đầu tư' },
    ],
  },
  {
    id: 'v-media',
    theme: 'Truyền thông',
    words: [
      { word: 'misinformation', meaning: 'thông tin sai lệch' },
      { word: 'go viral', meaning: 'lan truyền nhanh chóng' },
      { word: 'echo chamber', meaning: 'môi trường chỉ củng cố quan điểm sẵn có' },
      { word: 'censorship', meaning: 'kiểm duyệt' },
      { word: 'influencer', meaning: 'người có sức ảnh hưởng trên mạng' },
      { word: 'credible source', meaning: 'nguồn đáng tin cậy' },
    ],
  },
  {
    id: 'v-family',
    theme: 'Gia đình',
    words: [
      { word: 'nuclear family', meaning: 'gia đình hạt nhân (bố mẹ, con cái)' },
      { word: 'extended family', meaning: 'đại gia đình' },
      { word: 'upbringing', meaning: 'cách nuôi dạy' },
      { word: 'generation gap', meaning: 'khoảng cách thế hệ' },
      { word: 'dependent', meaning: 'người phụ thuộc' },
      { word: 'sibling', meaning: 'anh chị em ruột' },
    ],
  },
  {
    id: 'v-food',
    theme: 'Ẩm thực',
    words: [
      { word: 'staple food', meaning: 'thực phẩm chính, lương thực chủ đạo' },
      { word: 'processed food', meaning: 'thực phẩm chế biến sẵn' },
      { word: 'culinary', meaning: 'thuộc về ẩm thực, nấu ăn' },
      { word: 'palatable', meaning: 'ngon miệng, dễ ăn' },
      { word: 'food security', meaning: 'an ninh lương thực' },
      { word: 'organic', meaning: 'hữu cơ' },
    ],
  },
  {
    id: 'v-crime',
    theme: 'Tội phạm & pháp luật',
    words: [
      { word: 'juvenile delinquency', meaning: 'tội phạm vị thành niên' },
      { word: 'deterrent', meaning: 'yếu tố răn đe' },
      { word: 'rehabilitation', meaning: 'sự cải tạo, phục hồi' },
      { word: 'surveillance', meaning: 'giám sát' },
      { word: 'law-abiding', meaning: 'tuân thủ pháp luật' },
      { word: 'petty crime', meaning: 'tội phạm nhỏ, vặt' },
    ],
  },
  {
    id: 'v-society',
    theme: 'Xã hội',
    words: [
      { word: 'inequality', meaning: 'sự bất bình đẳng' },
      { word: 'social cohesion', meaning: 'sự gắn kết xã hội' },
      { word: 'marginalised', meaning: 'bị gạt ra ngoài lề (xã hội)' },
      { word: 'welfare system', meaning: 'hệ thống phúc lợi' },
      { word: 'demographic', meaning: 'thuộc về nhân khẩu học' },
      { word: 'community engagement', meaning: 'sự tham gia của cộng đồng' },
    ],
  },
  {
    id: 'v-art',
    theme: 'Nghệ thuật',
    words: [
      { word: 'aesthetic', meaning: 'tính thẩm mỹ' },
      { word: 'masterpiece', meaning: 'kiệt tác' },
      { word: 'contemporary art', meaning: 'nghệ thuật đương đại' },
      { word: 'exhibit', meaning: 'trưng bày, triển lãm' },
      { word: 'artistic expression', meaning: 'sự thể hiện nghệ thuật' },
      { word: 'heritage', meaning: 'di sản' },
    ],
  },
];
