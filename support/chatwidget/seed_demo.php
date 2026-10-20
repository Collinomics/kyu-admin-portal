<?php
/**
 * DEMO ONLY - seeds programme_chunks with a few sample Kyambogo-style
 * programmes so the chat widget has something to retrieve. Replace this
 * with real catalogue data (see sync_publish.php) in production.
 *
 * Run:  php seed_demo.php   (with NVIDIA_API_KEY + PG env vars set)
 * Safe to re-run: deterministic ids + ON CONFLICT DO NOTHING.
 */

declare(strict_types=1);

require_once __DIR__ . '/sync_publish.php'; // brings config.php, db.php, chunk/embed helpers

$programmes = [
    [
        'id' => 'bsc-computer-science',
        'name' => 'BSc Computer Science',
        'overview' => "The Bachelor of Science in Computer Science equips students with a strong foundation in computing theory and practice. It covers programming, algorithms, data structures, computer networks and the fundamentals of artificial intelligence.\n\nThe programme combines classroom learning with practical laboratory sessions so that graduates can design and build software systems that solve real problems.",
        'structure' => "Year 1: Introduction to Programming, Discrete Mathematics, Computer Architecture, Communication Skills.\n\nYear 2: Data Structures and Algorithms, Database Systems, Operating Systems, Computer Networks.\n\nYear 3: Software Project, Artificial Intelligence, Information Security, Industrial Training and a final-year project.",
        'admission_requirements' => "Direct entry: Uganda Advanced Certificate of Education (UACE) with two principal passes, including Mathematics, and a subsidiary pass in Physics or Economics.\n\nDiploma entry: a diploma in Computer Science or a related computing field from a recognised institution, with at least a credit classification.",
        'career_prospects' => "Graduates work as software engineers, systems analysts, network administrators, database administrators and ICT officers in government, private companies and NGOs. Many also pursue postgraduate study or start their own technology businesses.",
    ],
    [
        'id' => 'bsc-software-engineering',
        'name' => 'BSc Software Engineering',
        'overview' => "The Bachelor of Science in Software Engineering prepares students to build large, reliable software systems using industry practices. The programme emphasises the full software development lifecycle: requirements, design, implementation, testing and maintenance.\n\nStudents work on team projects throughout the programme, mirroring how software is built in industry.",
        'structure' => "Year 1: Programming Fundamentals, Introduction to Software Engineering, Mathematics for Computing, Communication Skills.\n\nYear 2: Object-Oriented Programming, Database Systems, Software Requirements Engineering, Web Application Development.\n\nYear 3: Software Architecture, Software Testing and Quality Assurance, Project Management, Industrial Training.\n\nYear 4: Capstone Project, DevOps and Cloud Computing, elective modules in mobile development or machine learning.",
        'admission_requirements' => "Direct entry: UACE with two principal passes, one of which must be Mathematics, and credits in English and Mathematics at UCE level.\n\nDiploma entry: a diploma in Software Engineering, Computer Science or Information Technology from a recognised institution, with at least a credit classification.",
        'career_prospects' => "Graduates are employed as software developers, quality assurance engineers, DevOps engineers, systems analysts and IT project managers. The skills are in high demand across banking, telecoms, health and public-sector digitalisation projects.",
    ],
    [
        'id' => 'bsc-information-technology',
        'name' => 'BSc Information Technology',
        'overview' => "The Bachelor of Science in Information Technology focuses on applying computing to meet organisational needs. Students learn networking, web and database technologies, and how to manage IT infrastructure and services.\n\nThe programme balances technical skills with an understanding of how organisations use information systems.",
        'structure' => "Year 1: IT Fundamentals, Programming, Mathematics for IT, Communication Skills.\n\nYear 2: Computer Networks, Web Development, Database Systems, Systems Administration.\n\nYear 3: Information Security, IT Project, e-Commerce, Industrial Training.",
        'admission_requirements' => "Direct entry: UACE with two principal passes in any two of Mathematics, Physics, Economics or a technical subject.\n\nDiploma entry: a diploma in Information Technology or a related field from a recognised institution, with at least a credit classification.",
        'career_prospects' => "Graduates work as IT officers, network administrators, web developers, database administrators and technical support specialists in both public and private organisations.",
    ],
];

$pdo = db();
$pdo->beginTransaction();
$inserted = 0;

$stmt = $pdo->prepare(
    'INSERT INTO programme_chunks
        (id, programme_id, programme_name, section, chunk_text, embedding, published, updated_at)
     VALUES
        (:id, :programme_id, :programme_name, :section, :chunk_text, :embedding::vector, TRUE, now())
     ON CONFLICT (id) DO NOTHING'
);

foreach ($programmes as $programme) {
    $chunks = chunk_programme($programme);
    foreach ($chunks as $i => $chunk) {
        $vector = nvidia_embed_text($chunk['text']);
        if (empty($vector)) {
            fwrite(STDERR, "embedding failed for {$programme['id']} chunk $i\n");
            continue;
        }
        $stmt->execute([
            ':id' => hash_point_id($programme['id'], $i),
            ':programme_id' => $programme['id'],
            ':programme_name' => $programme['name'],
            ':section' => $chunk['section'],
            ':chunk_text' => $chunk['text'],
            ':embedding' => to_pgvector($vector),
        ]);
        $inserted += $stmt->rowCount();
    }
}

$pdo->commit();
echo "Seeded $inserted chunks.\n";