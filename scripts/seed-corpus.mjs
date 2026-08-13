import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "data", "corpus");
fs.mkdirSync(dir, { recursive: true });

const now = "2026-08-13";
const docs = [
  {
    title: "Python (programming language)",
    url: "https://en.wikipedia.org/wiki/Python_(programming_language)",
    organization: "Wikipedia",
    tags: ["python", "programming", "beginners", "language"],
    extract: `Python is a high-level, general-purpose programming language that emphasizes code readability, simplicity, and ease-of-writing with the use of significant indentation, an extensive ("batteries-included") standard library, and garbage collection. Python supports multiple programming paradigms but with an emphasis on object-oriented programming and dynamic typing.
Guido van Rossum began working on Python in the late 1980s as a successor to the ABC programming language. Python 3.0, released in 2008, was a major revision and not completely backward-compatible with earlier versions. Beginning with Python 3.5, capabilities and keywords for typing were added to the language, allowing optional static typing. As of 2026, the Python Software Foundation supports Python 3.10, 3.11, 3.12, 3.13, and 3.14, following the project's annual release cycle and five-year support policy.
Python is widely taught as an introductory programming language.

== History ==
Python was conceived in the late 1980s by Guido van Rossum at Centrum Wiskunde & Informatica (CWI) in the Netherlands. It was designed as a successor to the ABC programming language. Implementation began in December 1989. Van Rossum first released it in 1991 as Python 0.9.0. The name Python derives from the British comedy series Monty Python's Flying Circus.
Python 2.0 was released on 16 October 2000. Python 3.0 was released on 3 December 2008. Python 2.7.18, released in 2020, was the last release of Python 2.

== Design philosophy and features ==
Python is a multi-paradigm programming language. Object-oriented programming and structured programming are fully supported, and many of their features support functional programming. Python uses dynamic typing and a combination of reference counting and a cycle-detecting garbage collector for memory management.
Python's core philosophy is summarized in the Zen of Python (PEP 20), including: Explicit is better than implicit. Simple is better than complex. Readability counts. There should be one—and preferably only one—obvious way to do it.

== Syntax and semantics ==
Python is meant to be an easily readable language. It does not use curly brackets to delimit blocks, and semicolons after statements are allowed but rarely used. Python uses whitespace indentation, rather than curly brackets or keywords, to delimit blocks. The recommended indent size is four spaces.
Statements include assignment (=), if/elif/else, for, while, try/except/finally, raise, class, def, with, break, continue, del, pass, assert, yield, return, import, and match/case.
Python has two types of division: floor division // and floating-point division /. The ** operator is used for exponentiation. == compares by value; is compares identity. Lists are written as [1, 2, 3] and are mutable; tuples as (1, 2, 3) are immutable.

== Standard library and ecosystem ==
Python ships with a large standard library covering operating-system interfaces, internet protocols, data formats, and testing. Third-party packages are typically installed from the Python Package Index (PyPI). Official documentation is published at docs.python.org by the Python Software Foundation.`,
  },
  {
    title: "Constitution of India",
    url: "https://en.wikipedia.org/wiki/Constitution_of_India",
    organization: "Wikipedia",
    tags: ["india", "constitution", "law", "polity", "upsc"],
    extract: `The Constitution of India is the supreme legal document of India, and the longest written national constitution in the world. The document lays down the framework that demarcates fundamental political code, structure, procedures, powers, and duties of government institutions and sets out fundamental rights, directive principles, and the duties of citizens.
It espouses constitutional supremacy (not parliamentary supremacy found in the United Kingdom, since it was created by a constituent assembly rather than Parliament) and was adopted with a declaration in its preamble. The Indian Constitution does not contain a provision to limit the powers of the parliament to amend the constitution. However, the Supreme Court in Kesavananda Bharati v. State of Kerala held that there were certain features of the Constitution so integral to its functioning and existence that they could never be cut out of the constitution (known as the 'Basic Structure' Doctrine).
The Government of India Act 1935 provided the basis for the constitution of India. The Constituent Assembly of India adopted the constitution on 26 November 1949 and it became effective on 26 January 1950. India celebrates its constitution on 26 January as Republic Day.
The constitution declares India a sovereign, socialist, secular, and democratic republic, assures its citizens justice, equality, and liberty, and endeavours to promote fraternity.

== Constituent Assembly ==
The constitution was drafted by the Constituent Assembly, elected by elected members of the provincial assemblies. The 389-member assembly (reduced to 299 after the partition of India) took almost three years to draft the constitution, holding eleven sessions over a 165-day period. B. R. Ambedkar chaired the Drafting Committee appointed on 29 August 1947. Sir B. N. Rau served as constitutional advisor and prepared an initial draft in February 1948.
On 26 November 1949 the Constitution was passed and adopted. The day is celebrated as Constitution Day (National Law Day). It came into force on 26 January 1950.

== Structure ==
At its enactment, it had 395 articles in 22 parts and 8 schedules. The amended constitution has a preamble and 470 articles grouped into 25 parts, with 12 schedules and five appendices. It has been amended more than 100 times.
Parts include: I Union and its Territory (Arts 1–4); II Citizenship (5–11); III Fundamental Rights (12–35); IV Directive Principles (36–51); IVA Fundamental Duties (51A); V The Union (52–151); VI The States (152–237); VIII Union Territories; IX Panchayats; IXA Municipalities; XI Union–State relations; XV Elections; XVII Languages; XVIII Emergency provisions; XX Amendment (Article 368).

== Governmental sources of power ==
India is governed by a parliamentary system. Under Articles 52 and 53 the president is head of the executive. Under Article 74 the prime minister is head of the Council of Ministers. Under Article 75(3) the Council of Ministers is answerable to the lower house. The constitution is often described as federal in nature and unitary in spirit.`,
  },
  {
    title: "Machine learning",
    url: "https://en.wikipedia.org/wiki/Machine_learning",
    organization: "Wikipedia",
    tags: ["machine learning", "ai", "data science", "statistics"],
    extract: `Machine learning (ML) is a field of study in artificial intelligence concerned with the development and study of statistical algorithms that can learn from data and generalize to unseen data, and thus perform tasks without being explicitly programmed. Advances in the field of deep learning have allowed neural networks, a class of statistical algorithms, to surpass many previous machine learning approaches in performance.
Statistics and mathematical optimisation methods compose the foundations of machine learning. Data mining is a related field of study, focusing on exploratory data analysis through unsupervised learning.
From a theoretical viewpoint, probably approximately correct learning provides a mathematical and statistical framework for describing machine learning.

== History ==
The term machine learning was coined in 1959 by Arthur Samuel, an IBM employee and pioneer in the field of computer gaming and artificial intelligence. In 1949 Donald Hebb published The Organization of Behavior, introducing a theoretical neural structure. Tom M. Mitchell provided a widely quoted definition: "A computer program is said to learn from experience E with respect to some class of tasks T and performance measure P if its performance at tasks in T, as measured by P, improves with experience E."
In 2014 Ian Goodfellow and others introduced generative adversarial networks. By 2016, AlphaGo had won against top human players in Go using reinforcement learning.

== Relationships to other fields ==
Machine learning grew out of the quest for artificial intelligence. By 1980 expert systems had come to dominate AI; statistical learning later flourished as its own field in the 1990s. Machine learning focuses on prediction based on known properties learned from training data; data mining focuses on discovery of previously unknown properties.
Many learning problems are formulated as minimisation of a loss function on a training set. Supervised learning uses labelled examples; unsupervised learning finds structure without labels; reinforcement learning learns from rewards.`,
  },
  {
    title: "Artificial intelligence",
    url: "https://en.wikipedia.org/wiki/Artificial_intelligence",
    organization: "Wikipedia",
    tags: ["ai", "automation", "machine learning"],
    extract: `Artificial intelligence (AI) is the capability of computational systems to perform tasks typically associated with human intelligence, such as learning, reasoning, problem-solving, perception, and decision-making. It is a field of research in engineering, mathematics, and computer science that develops and studies methods and software that enable machines to perceive their environment and use learning and intelligence to take actions that maximise their chances of achieving defined goals.
High-profile applications of AI include advanced web search engines, chatbots, virtual assistants, autonomous vehicles, play and analysis in strategy games, and content generation.
The traditional goals of AI research include learning, reasoning, knowledge representation, planning, natural language processing, and perception, as well as support for robotics.
Artificial intelligence was founded as an academic discipline in 1956. The field went through multiple cycles of optimism, followed by periods of disappointment known as AI winters. Funding and interest increased substantially after 2012, when GPUs started being used to accelerate neural networks. This growth accelerated further after 2017 with the transformer architecture. In the 2020s, an AI boom coincided with advances in generative AI.
Some companies aim to create artificial general intelligence (AGI)—AI that can complete nearly any cognitive task at least as well as a human. Ethical concerns, environmental effects, and potential existential risks have prompted discussions of AI regulation.`,
  },
  {
    title: "Bhagat Singh",
    url: "https://en.wikipedia.org/wiki/Bhagat_Singh",
    organization: "Wikipedia",
    tags: ["bhagat singh", "biography", "india", "independence"],
    extract: `Bhagat Singh (27 September 1907 – 23 March 1931) was an Indian anti-colonial revolutionary who participated in the mistaken murder of a junior British police officer in December 1928 in what was intended to be retaliation for the death of Lala Lajpat Rai, an Indian nationalist. He later took part in a largely symbolic bombing of the Central Legislative Assembly in Delhi and a hunger strike in jail, which turned him into a household name in the Punjab region, and, after his execution at age 23, a martyr and folk hero in Northern India.
Bhagat Singh was born into a Punjabi Jat Sikh family on 27 September 1907, in the village of Banga, in the Lyallpur district of the Punjab, in what was then British India and is today Pakistan. His father Kishan Singh and uncle Ajit Singh were active in progressive politics, including the Ghadar Movement.
In December 1928, Bhagat Singh and Shivaram Rajguru, members of the Hindustan Socialist Republican Association (HSRA), shot dead 21-year-old British police officer John P. Saunders in Lahore, mistaking him for superintendent James Scott, whom they held responsible for the death of Lala Lajpat Rai after a lathi charge. Chandra Shekhar Azad shot dead an Indian police head constable who attempted to give chase.
In April 1929, Singh and Batukeshwar Dutt set off two low-intensity homemade bombs among unoccupied benches of the Central Legislative Assembly in Delhi, showered leaflets, shouted slogans, and allowed the authorities to arrest them. Awaiting trial, Singh joined Jatin Das in a hunger strike demanding better prison conditions; Das died of starvation in September 1929.
Bhagat Singh was convicted of the murder of John Saunders and Channan Singh, and hanged in March 1931, aged 23. Jawaharlal Nehru wrote that Singh became a symbol; the act was forgotten, the symbol remained. He is sometimes referred to as the Shaheed-e-Azam ("Great martyr").`,
  },
  {
    title: "History of India",
    url: "https://en.wikipedia.org/wiki/History_of_India",
    organization: "Wikipedia",
    tags: ["history of india", "india", "civilization", "upsc"],
    extract: `Anatomically modern humans are estimated to have first arrived on the Indian subcontinent between 73,000 and 55,000 years ago. The earliest known human remains in South Asia date to 30,000 years ago. Sedentariness began around 7000 BCE; by 4500 BCE settled life had spread, and gradually evolved into the Indus Valley Civilisation, which flourished between 2500 BCE and 1900 BCE in present-day Pakistan and north-western India.
Around 1800–1500 BCE Indo-Aryan tribes moved into the north-western region of India. The Vedic Period (1500–500 BCE) was marked by the composition of the Vedas. Around 600 BCE a second urbanization occurred; janapadas were consolidated into mahajanapadas. This period saw the rise of Jainism and Buddhism.
Chandragupta Maurya established the Maurya Empire. Ashoka is widely recognised for the Kalinga War and his subsequent acceptance of Buddhism. The Gupta Empire in the 4th to 6th centuries CE is often described as a Classical or Golden Age of India.
The Delhi Sultanate, established in 1206, ruled much of northern India in the 14th century. The early modern period began in the 16th century when the Mughal Empire conquered most of the subcontinent. The East India Company gradually acquired control of huge areas between the mid-18th and mid-19th centuries. After the Indian Rebellion of 1857, India was ruled directly by the British Crown. After World War I a nationwide independence struggle was launched by the Indian National Congress, led by Mahatma Gandhi. The British Indian Empire was partitioned in August 1947 into the Dominion of India and Dominion of Pakistan.`,
  },
  {
    title: "Photosynthesis",
    url: "https://en.wikipedia.org/wiki/Photosynthesis",
    organization: "Wikipedia",
    tags: ["photosynthesis", "biology", "class 10", "science", "class 12"],
    extract: `Photosynthesis is a system of biological processes by which photopigment-bearing autotrophic organisms, such as most plants, algae and cyanobacteria, convert light energy—typically from sunlight—into the chemical energy necessary to fuel their metabolism. The term photosynthesis usually refers to oxygenic photosynthesis, a process that releases oxygen as a byproduct of water splitting. Photosynthetic organisms store the converted chemical energy within the bonds of intracellular organic compounds, typically carbohydrates.
Photosynthesis plays a critical role in producing and maintaining the oxygen content of the Earth's atmosphere, and it supplies most of the biological energy necessary for complex life on Earth.
In plants, pigments are chlorophylls held inside chloroplasts, abundant in leaf cells. In light-dependent reactions, some energy is used to strip electrons from water, producing oxygen gas. The hydrogen freed by the splitting of water is used in the creation of NADPH and ATP.
In plants, algae, and cyanobacteria, sugars are synthesized by light-independent reactions called the Calvin cycle. Atmospheric carbon dioxide is incorporated into ribulose bisphosphate (RuBP). Using ATP and NADPH, the resulting compounds form carbohydrates such as glucose.
Net equation: CO2 + H2O + photons → [CH2O] + O2
Photosynthesis was discovered in 1779 by Jan Ingenhousz, who showed that plants need light, not just soil and water. The average rate of energy captured by global photosynthesis is approximately 130 terawatts.`,
  },
  {
    title: "Biology",
    url: "https://en.wikipedia.org/wiki/Biology",
    organization: "Wikipedia",
    tags: ["biology", "science", "class 10", "class 12"],
    extract: `Biology is the scientific study of life and living organisms. It is a broad natural science that encompasses a wide range of fields and unifying principles that explain the structure, function, growth, origin, evolution, and distribution of life. Central to biology are five fundamental themes: the cell as the basic unit of life, genes and heredity as the basis of inheritance, evolution as the driver of biological diversity, energy transformation for sustaining life processes, and homeostasis.
Biology examines life across multiple levels of organization, from molecules and cells to organisms, populations, and ecosystems. Subdisciplines include molecular biology, physiology, ecology, evolutionary biology, developmental biology, and systematics.
Modern biology is grounded in the theory of evolution by natural selection, first articulated by Charles Darwin, and in the molecular understanding of genes encoded in DNA. The discovery of the structure of DNA and advances in molecular genetics have transformed many areas of biology.
Cell theory: the basic unit of organisms is the cell; individual cells have the characteristics of life; all cells come from the division of other cells. Genetics began with Gregor Mendel in 1865. The Human Genome Project was launched in 1990 to map the human genome.`,
  },
  {
    title: "Sexual reproduction",
    url: "https://en.wikipedia.org/wiki/Sexual_reproduction",
    organization: "Wikipedia",
    tags: ["class 12", "biology", "reproduction", "flowering plants", "ncert"],
    extract: `Sexual reproduction is a type of reproduction that involves a complex life cycle in which a gamete (haploid reproductive cells, such as a sperm or egg cell) with a single set of chromosomes combines with another gamete to produce a zygote that develops into an organism composed of cells with two sets of chromosomes (diploid).
In eukaryotes, diploid precursor cells divide to produce haploid cells in a process called meiosis. During meiosis, homologous chromosomes pair and exchange genetic information in recombination, increasing genetic diversity.
During sexual reproduction, two haploid gametes combine into one diploid cell known as a zygote in fertilization. In plants, the diploid phase, known as the sporophyte, produces spores by meiosis. These spores germinate and divide by mitosis to form a haploid multicellular phase, the gametophyte, which produces gametes directly by mitosis. This type of life cycle is known as alternation of generations.
Flowering plants (angiosperms) produce flowers containing stamens (male) and/or carpels (female). Pollen produced in anthers lands on a stigma, grows a pollen tube, and delivers sperm to the ovule. Double fertilization is characteristic of angiosperms: one sperm fuses with the egg to form the zygote; the other fuses with polar nuclei to form endosperm.`,
  },
  {
    title: "Geography of India",
    url: "https://en.wikipedia.org/wiki/Geography_of_India",
    organization: "Wikipedia",
    tags: ["upsc", "geography", "india"],
    extract: `India is a country in South Asia on the Indian Plate, north of the equator. It is bounded by the Indian Ocean on the south, the Arabian Sea on the southwest, and the Bay of Bengal on the southeast. It shares land borders with Pakistan, China, Nepal, Bhutan, Bangladesh and Myanmar. Sri Lanka and the Maldives are nearby island neighbours.
Physiographic divisions commonly taught in Indian geography include the Himalayan mountains, the Northern Plains, the Peninsular Plateau, the Indian Desert, the Coastal Plains, and the Islands. The Himalaya are young fold mountains; the Indo-Gangetic plain is formed of alluvium from the Indus, Ganga and Brahmaputra systems; the Deccan plateau is largely Precambrian shield with Deccan Traps basalt in the west.
The Tropic of Cancer divides India roughly in half. The southwest monsoon (June–September) brings most of India's annual rainfall. Climate types range from alpine in the high Himalaya to tropical wet in the Western Ghats and northeast, arid in the Thar, and tropical wet-and-dry over much of the peninsula.
Major rivers include the Ganga, Yamuna, Brahmaputra, Godavari, Krishna, Kaveri, Narmada and Tapi. Soils include alluvial, black (regur), red, laterite, arid and forest soils. Natural vegetation ranges from tropical evergreen forest to desert scrub, with a large monsoon deciduous belt.`,
  },
  {
    title: "English language",
    url: "https://en.wikipedia.org/wiki/English_language",
    organization: "Wikipedia",
    tags: ["english", "speaking", "grammar", "language course"],
    extract: `English is a West Germanic language in the Indo-European language family, whose speakers, called Anglophones, originated in early medieval England. It is named after the Angles, one of the ancient Germanic peoples that migrated to the island of Great Britain. English is the most spoken language in the world, primarily due to the global influences of the former British Empire and the United States.
English grammar has minimal inflection compared with most Indo-European languages. It relies on word order (typically subject–verb–object) and auxiliary verbs to express tense, aspect, mood and voice. Nouns are not grammatically gendered. Pronouns retain some case distinctions (I/me, she/her).
Spoken English uses stress-timed rhythm. Vowel quality and word stress change meaning (REcord vs reCORD). For learners, listening and speaking practice typically starts with high-frequency greetings, questions (wh- and yes/no), present simple, and common conversational repair strategies ("Could you repeat that?").
A practical speaking course covers: sounds and word stress; everyday functions (introducing, requesting, agreeing); present/past/future forms; articles and prepositions; connectors for longer turns; and pronunciation of endings (-s, -ed).`,
  },
  {
    title: "Data science",
    url: "https://en.wikipedia.org/wiki/Data_science",
    organization: "Wikipedia",
    tags: ["data science", "statistics", "machine learning", "course"],
    extract: `Data science is an interdisciplinary academic field that uses statistics, scientific computing, scientific methods, processes, algorithms and systems to extract or extrapolate knowledge and insights from potentially noisy, structured, or unstructured data.
Data science also integrates domain knowledge from the underlying application domain (e.g., natural sciences, information technology, medicine). Data science is related to data mining, machine learning and big data.
A typical data-science workflow includes: problem formulation; data collection and storage; cleaning and transformation; exploratory analysis and visualisation; statistical modelling or machine learning; evaluation; and communication of results with attention to bias, leakage, and reproducibility.
Common tools include Python or R, SQL, notebooks, and libraries such as pandas, scikit-learn, and visualisation packages. Official documentation for those libraries should be treated as the source of truth for current APIs.`,
  },
  {
    title: "Automation",
    url: "https://en.wikipedia.org/wiki/Automation",
    organization: "Wikipedia",
    tags: ["automation", "ai automation", "industry"],
    extract: `Automation describes a wide range of technologies that reduce human intervention in processes, namely by predetermining decision criteria, subprocess relationships, and related actions, and embodying those predeterminations in machines. Automation has been achieved by various means including mechanical, hydraulic, pneumatic, electrical, electronic devices, and computers, usually in combination.
The benefit of automation includes labor savings, reducing waste, savings in electricity costs, savings in material costs, and improvements to quality, accuracy, and precision. Automation includes the use of various control systems for operating equipment such as machinery, processes in factories, boilers, heat treating ovens, switching on telephone networks, steering, stabilization of ships, aircraft and other applications and vehicles with reduced human intervention.
In information work, "AI automation" typically means chaining software tools—APIs, robotic process automation (RPA), workflow engines, and machine-learning models—so that a business process runs with less manual clicking. Reliability still depends on validation, logs, and human review for exceptions.`,
  },
  {
    title: "Chemical reaction",
    url: "https://en.wikipedia.org/wiki/Chemical_reaction",
    organization: "Wikipedia",
    tags: ["class 10", "science", "chemistry", "ncert"],
    extract: `A chemical reaction is a process that leads to the chemical transformation of one set of chemical substances to another. Classically, chemical reactions encompass changes that only involve the positions of electrons in the forming and breaking of chemical bonds between atoms, with no change to the nuclei, and can often be described by a chemical equation.
Chemical reactions are described with chemical equations, which symbolically present the starting materials, end products, and sometimes intermediate products and reaction conditions. Chemical reactions happen at a characteristic reaction rate at a given temperature and chemical concentration.
School-level types include combination, decomposition, displacement, double displacement, and redox (oxidation–reduction). Indicators of a reaction can include gas evolution, colour change, precipitate formation, and energy change (exothermic or endothermic). Balancing equations conserves atoms on both sides. The law of conservation of mass, associated with Antoine Lavoisier, states that mass is neither created nor destroyed in a chemical reaction.`,
  },
  {
    title: "Electricity",
    url: "https://en.wikipedia.org/wiki/Electricity",
    organization: "Wikipedia",
    tags: ["class 10", "science", "physics", "electricity"],
    extract: `Electricity is the set of physical phenomena associated with the presence and motion of matter possessing an electric charge. Electricity is related to magnetism, both being part of the phenomenon of electromagnetism, as described by Maxwell's equations. Common phenomena are related to electricity, including lightning, static electricity, electric heating, electric discharges and many others.
In school physics, electric current is the flow of charge. Potential difference (voltage) is the work done per unit charge. Ohm's law states that V = IR for many metallic conductors at constant temperature. Resistance depends on material, length and cross-sectional area (R = ρl/A). Series and parallel combinations of resistors follow standard rules. Electric power is P = VI.
    A simple circuit contains a source, connecting wires, and a load. Heating effect of current is used in fuses and heaters. Magnetic effects of current are the basis of motors and galvanometers. Safety includes earthing, fuses, and not handling live wires with wet hands.`,
  },
  {
    title: "Untouchability",
    url: "https://en.wikipedia.org/wiki/Untouchability",
    organization: "Wikipedia",
    tags: ["untouchability", "untouchables", "caste", "dalit", "ambedkar", "india"],
    extract: `Untouchability is a form of social institution that legitimises and enforces practices against people belonging to particular social groups, historically in the Indian caste system. Those subjected to it were treated as polluting and excluded from wells, temples, schools, and the interior of the village. B. R. Ambedkar made the origin and persistence of untouchability the subject of his 1948 book The Untouchables: Who Were They and Why They Became Untouchables?
In independent India, Article 17 of the Constitution abolishes untouchability and forbids its practice in any form. The Protection of Civil Rights Act and later the Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act give statutory force to that ban. Legal abolition did not by itself end social exclusion.
Ambedkar rejected explanations that treated untouchability as an eternal religious given. He asked a historical question: who the Untouchables had been, and by what process they became a hereditary outcaste group. His Broken Men theory and his discussion of beef-eating are interpretations advanced in that book, not uncontested archaeological facts.
Related modern terms include Dalit and Scheduled Castes. These legal and political categories are not identical with Ambedkar's historical reconstruction of Broken Men on the outskirts of villages.`,
  },
  {
    title: "The Untouchables: Who Were They and Why They Became Untouchables?",
    url: "https://en.wikipedia.org/wiki/B._R._Ambedkar",
    organization: "Wikipedia",
    tags: ["ambedkar", "the untouchables", "broken men", "untouchability", "1948", "beef", "buddhism"],
    extract: `The Untouchables: Who Were They and Why They Became Untouchables? is a historical study by B. R. Ambedkar, published in 1948. It is included among Dr. Babasaheb Ambedkar: Writings and Speeches. The book asks who the Untouchables were and why they became a hereditary excluded group.
Ambedkar's central hypothesis is the Broken Men theory. He argued that defeated or broken tribal people attached themselves to settled village communities, lived on the outskirts, and later became Untouchables. He linked Broken Men to Buddhism and to contempt directed at Buddhists after the decline of Buddhism in India.
A second proposed explanation concerns beef-eating. Ambedkar held that ancient Hindus, including Brahmins, had eaten beef; that Brahmins later gave up beef and made the cow sacred as they competed with Buddhism; that non-Brahmins followed; and that Broken Men continued to eat the flesh of dead cows, which then became a mark of untouchability. These dietary and chronological claims are Ambedkar's interpretations of textual evidence, not universally established historical facts.
The book should be read as a reasoned thesis with stated assumptions. Later scholars have discussed, extended, or criticised the Broken Men argument. Independent India's Constitution, drafted by a committee chaired by Ambedkar, abolishes untouchability in Article 17 — a legal fact distinct from the 1948 historical hypothesis.`,
  },
  {
    title: "Article 17 of the Constitution of India — Abolition of Untouchability",
    url: "https://legislative.gov.in/constitution-of-india/",
    organization: "Government of India — Legislative Department",
    tags: ["article 17", "constitution", "untouchability", "ambedkar", "law"],
    extract: `Article 17 of the Constitution of India is titled Abolition of Untouchability. It states: Untouchability is abolished and its practice in any form is forbidden. The enforcement of any disability arising out of Untouchability shall be an offence punishable in accordance with law.
This provision is primary-source constitutional law. It belongs to Part III (Fundamental Rights). It is distinct from B. R. Ambedkar's 1948 historical book The Untouchables, which offered a hypothesis about origins. The constitutional text establishes the modern legal status of untouchability; it does not by itself prove or disprove the Broken Men theory or the beef-eating explanation.
Parliament gave effect to Article 17 through statutes that punish the enforcement of disabilities arising from untouchability. Official copies of the Constitution are published by the Legislative Department of the Government of India.`,
  },
];

for (const d of docs) {
  const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  fs.writeFileSync(
    path.join(dir, slug + ".json"),
    JSON.stringify({ ...d, license: "CC BY-SA 4.0", retrievedAt: now, language: "en" })
  );
}
console.log("seeded", docs.length, "corpus docs");
