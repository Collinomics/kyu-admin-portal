<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Faculty;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class OrganisationSeeder extends Seeder
{
    public function run(): void
    {
        $units = [
            'Faculty of Engineering' => ['Civil and Environmental Engineering', 'Mechanical and Production Engineering', 'Electrical and Electronics Engineering', 'Bio-Medical and Mechatronics Engineering'],
            'Faculty of Science' => ['Biological Science', 'Physics', 'Chemistry', 'Mathematics and Statistics'],
            'Faculty of Agriculture' => [],
            'Faculty of Special Needs & Rehabilitation' => [],
            'Faculty of Arts and Humanities' => [],
            'Faculty of Social Sciences' => [],
            'School of Education' => ['Foundations and Educational Psychology', 'Teacher Education and Extension', 'Curriculum, Pedagogy and Educational Media'],
            'School of Art and Industrial Design' => [],
            'School of Management & Entrepreneurship' => ['Finance, Accounting and Micro-finance', 'Business Administration and Entrepreneurship', 'Procurement and Supply Chain Management'],
            'School of Built Environment' => [],
            'School of Computing and Information Science' => ['Computer Science', 'Networks, Data Science and Artificial Intelligence', 'Library and Information Science'],
            'School of Vocational Studies' => [],
            'Institute of Distance Education, E-Learning & Learning Centres' => [],
        ];

        foreach ($units as $name => $departments) {
            $faculty = Faculty::firstOrCreate(['name' => $name], [
                'id' => (string) Str::uuid(),
                'code' => Str::upper(Str::substr(Str::slug($name, ''), 0, 24)),
                'is_active' => true,
            ]);
            foreach ($departments as $departmentName) {
                Department::firstOrCreate(
                    ['faculty_id' => $faculty->id, 'name' => $departmentName],
                    ['id' => (string) Str::uuid(), 'code' => Str::upper(Str::substr(Str::slug($departmentName, ''), 0, 24)), 'is_active' => true],
                );
            }
        }
    }
}
